import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import input from "input";
import { NewMessageEvent, NewMessage } from "telegram/events";
import _ from "lodash";
import { getUserInfo, parseMessage } from "./helpers";
import TypeInputChannel = Api.TypeInputChannel;
import { EventBuilder } from "telegram/events/common";
import CONFIG from "./constants.json";

const apiId = CONFIG.tg_api_id;
const apiHash = CONFIG.tg_api_hash;
const stringSession = new StringSession(CONFIG.tg_session_id);
let client: TelegramClient = null;
const isTargetChannel = (msg: NewMessageEvent | Api.UpdateNewChannelMessage) => {
  try {
    const channels = CONFIG.channel_ids.map(BigInt);
    return channels.includes(_.get(msg.message.peerId.toJSON(), "channelId.value", -1));
  } catch (e) {
    return false;
  }
}

const processMessage = async (msg: NewMessageEvent) => {
  if (!isTargetChannel(msg))
    return;

  const channel = await msg.getInputChat() as TypeInputChannel;
  const user = await getUserInfo(msg);
  await parseMessage(msg, user, channel);
}

/**
 * @description Remove user joined/left messages sent in group/supergroup
 */
const processUpdates = async (msg: Api.UpdateNewChannelMessage) => {
  if (!isTargetChannel(msg))
    return;

  if (["MessageActionChatDeleteUser", "MessageActionChatAddUser"].includes(_.get(msg, "message.action.className", null))) {
    await client.deleteMessages(msg.message.peerId, [msg.message.id], {})
  }
};

// @ts-ignore
(async () => {
  console.log("Loading interactive example...");
  client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });
  await client.start({
    phoneNumber: async () => await input.text("Please enter your number: "),
    password: async () => await input.text("Please enter your password: "),
    phoneCode: async () =>
      await input.text("Please enter the code you received: "),
    onError: (err) => console.log(err),
  });
  console.log("You should now be connected.");
  console.log(client.session.save()); // Save this string to avoid logging in again

  client.addEventHandler(processUpdates, new EventBuilder({}));
  client.addEventHandler(processMessage, new NewMessage({}));
})();
