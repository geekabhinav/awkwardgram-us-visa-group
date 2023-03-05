### AwkwardGram Visa Agents Blocker

This will go through messages, and photos (OCR) to analyze and block people spamming in visa slot tracking Telegram groups. These groups serve people in India to track US visa slot availability, and unsuspecting people often fall for these scammers who charge them money and run away.

#### Steps to use
1. Clone repo
2. `cp src/constants.sample.json src/constants.json`
3. Replace the keys as required
4. `yarn start`

#### Dependency
1. Yarn
2. NodeJS >= 12
3. [Tesseract](https://github.com/tesseract-ocr/tesseract) installed on the system
