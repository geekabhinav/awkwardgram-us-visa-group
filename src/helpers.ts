import { NewMessageEvent } from "telegram/events";
import { Api } from "telegram";
import { promises as fs } from "fs";
import _ from "lodash";
import TypeInputChannel = Api.TypeInputChannel;
import InputReportReasonSpam = Api.InputReportReasonSpam;
import moment from "moment";
import MessageMediaPhoto = Api.MessageMediaPhoto;
import CONFIG from "./constants.json";
const tesseract = require("node-tesseract-ocr")

const MEDIA_DIR = "./media";

export interface IUserInfo {
  username: string;
  fullName: string;
  nameSlug: string;
  userId: number;
}

export const getUserInfo = async (msg: NewMessageEvent): Promise<IUserInfo> => {
  const user = await msg.message.getSender() as Api.User;
  const fullName = _.compact([user.firstName, user.lastName]).join(" ");
  return {
    username: user.username,
    nameSlug: fullName.replace(/[^A-Za-z0-9]/ig, "-"),
    fullName,
    userId: user.id.valueOf()
  }
}

export interface IMessage {
  text: string;
  photoLocation?: string;
  photoText?: string;
  timestamp: number
  user: IUserInfo;
}

export const parseMessage = async (msg: NewMessageEvent, user: IUserInfo, channel: TypeInputChannel): Promise<IMessage> => {
  let hasMedia = (msg.message?.media as MessageMediaPhoto)?.photo;
  let photoText = undefined;
  let photoLocation = hasMedia ? `${MEDIA_DIR}/Photo_${[user.nameSlug, user.userId].join("-")}_${msg.message.date}.png` : undefined;

  const message: IMessage = {
    text: msg.message.message,
    timestamp: msg.message.date,
    photoLocation,
    photoText,
    user
  };

  if (CONFIG.admin_ids.includes(message.user.userId)) {
    return;
  }

  if (hasMedia) {
    try {
      const buffer = await msg.client.downloadMedia(msg.message, {
        progressCallback: (total, downloaded) => console.log("Progress: ", total, downloaded)
      });
      const config = {
        lang: "eng",
        oem: 1,
        psm: 3,
      }
      await fs.writeFile(photoLocation, buffer);
      message.photoText = await tesseract.recognize(buffer, config);
    } catch (error) {
      message.photoText = "[ERROR] " + JSON.stringify(msg.message.media);
    }
  }

  if(checkIfSpam(message, user)) {
    await deleteMessage(msg, channel);
    await banUser(msg, user);
    reportUser(msg, message, user);
  }
  return message;
}

export const deleteMessage = async (msg: NewMessageEvent, channel: TypeInputChannel): Promise<void> => {
  await msg.client.deleteMessages(channel, [msg.message.id], {})
}
export const checkIfSpam = (message: IMessage, user: IUserInfo): boolean => {
  const nameCheck = processSpamRulesName(message, user);
  const textCheck = processSpamRulesText(message, user);
  const photoCheck = processSpamRulesPhoto(message, user);

  return [nameCheck, textCheck, photoCheck].indexOf(true) > -1;
}

export const banUser = async (msg: NewMessageEvent, user: IUserInfo): Promise<void> => {
  try {
    await msg.client.invoke(new Api.channels.EditBanned({
        channel: msg._chatPeer,
        participant: msg.message._inputSender,
        bannedRights: new Api.ChatBannedRights({
          sendMessages: true,
          viewMessages: true,
          sendMedia: true,
          untilDate: 0
        })
      }
    ));
  } catch (e) {
    console.log("Ban user failed: ", e, user, msg.message?.text);
  }
};

const reportUser = (msg: NewMessageEvent, message: IMessage, user: IUserInfo) => {
  msg.client.invoke(new Api.messages.Report({
    message: "Spam",
    peer: msg._chatPeer,
    id: [msg.message.id],
    reason: new InputReportReasonSpam()
  })).catch(() => null).finally(() => logEvents(msg, message, user));
}

const processSpamRulesName = (message: IMessage, user: IUserInfo): boolean => {
  let isSpam = false, textToCheck = removeAccents(user.fullName).toLowerCase();
  SPAM_RULES.fullName.blacklist.some(rule => {
    if (textToCheck.includes(rule)) {
      isSpam = true;
      return true;
    }
  });

  return isSpam;
};

const processSpamRulesText = (message: IMessage, user: IUserInfo): boolean => {
  let textToCheck = message.text.replace(/\n/ig, " ").trim();
  textToCheck = removeAccents(textToCheck).replace(/(\s|[^A-Za-z0-9])/ig, "").toLowerCase();
  let isSpam = false;
  SPAM_RULES.text.blacklist.some(rule => {
    if (textToCheck.includes(rule.replace(/\s/ig, ""))) {
      isSpam = true;
      return true;
    }
  });

  if (!isSpam) {
    isSpam = SPAM_RULES.textFull.blacklist.includes(removeAccents(message.text).trim().toLowerCase());
  }
  return isSpam;
};

const processSpamRulesPhoto = (message: IMessage, user: IUserInfo): boolean => {
  if (!message.photoText || typeof message.photoText !== "string") {
    return false;
  }

  let textToCheck = message.photoText.replace(/\n/ig, " ").trim();
  textToCheck = textToCheck.replace(/\s+/ig, " ").toLowerCase();
  let isSpam = false;
  SPAM_RULES.photoText.blacklist.some(rule => {
    if (textToCheck.includes(rule)) {
      isSpam = true;
      return true;
    }
  });
  return isSpam;
};

const logEvents = async (msg: NewMessageEvent, message: IMessage, user: IUserInfo) => {
  const result = `Time: ${moment.unix(message.timestamp).toISOString()}
User: ${[user.fullName, user.username, user.userId].join(" / ")}
Message: ${message.text}
Photo: ${message.photoLocation ? message.photoLocation : "N/A"}
Action: banned & reported 
`;
  await msg.client.sendMessage(CONFIG.logger_channel, { message: result });
};

const SPAM_RULES = {
  fullName: {
    type: "name",
    blacklist: [
      "owl slot",
      "agency",
      "check bio",
      "in my bio",
      "updates",
      "visa",
      "slot",
      "ping me",
      "dm me"
    ]
  },
  textFull: {
    type: 'text',
    blacklist: [
      "slots are available",
      "slots available",
      "slot available"
    ]
  },
  text: {
    type: "text",
    blacklist: [
      "ping me",
      "png me",
      "dm me",
      "dm for",
      "dm for",
      "contact me",
      "pranavforhelp",
      "w h a t s a p p",
      "confirmation within",
      "confirmation with in",
      "confirmation in 12",
      "confirmation in 24",
      "confirmation in 48",
      "confirmation in 6",
      "confirmation in 2",
      "1 hour confirmation",
      "c o n f i r m a t i o n",
      "very genuine booking",
      "hyderabad mumbai new delhi and chennai",
      "gwhatsapp",
      "pmfs",
      "dm slots",
      "he really changed my life",
      "paying after booking only",
      "93907"
    ]
  },
  photoText: {
    type: "photo",
    blacklist: [
      "ping me",
      "dm me",
      "contact me",
      "w h a t s a p p",
      "whatsapp",
      "confirmation within",
      "confirmation with in",
      "paying after booking only",
      "confirmation in 12",
      "confirmation in 24",
      "confirmation in 48",
      "confirmation in 6",
      "confirmation in 2",
      "1 hour confirmation",
      "c o n f i r m a t i o n",
      "slot agency",
      "payment after",
      "payment only after",
      "ping me asap",
      "slots available",
      "100% genuine",
      "visa agent"
    ]
  }
}

const removeAccents = str => String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
