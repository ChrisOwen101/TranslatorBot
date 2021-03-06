/*jshint esversion: 6 */

const Bot = require('slackbots');
const fetch = require("node-fetch");
const translate = require('google-translate-api');
const MongoClient = require('mongodb').MongoClient;

const dbUser = process.env.DB_USER.trim();
const dbPass = process.env.DB_PASS.trim();
const uri = `mongodb+srv://${dbUser}:${dbPass}@translatorbot-izwur.mongodb.net/test`;

global.Headers = fetch.Headers;

class TranslatorBot {
    constructor(appToken, botToken, botId, teamId) {

        this.appToken = appToken;
        this.botToken = botToken;
        this.teamId = teamId;
        this.isPayed = true;
        this.toLang = 'en';

        if (botId === undefined) {
            this.getBotId();
        } else {
            this.botId = botId;
        }

        console.log("Bot token:" + this.botToken);
        console.log("App token:" + this.appToken);

        this.lastLanguage = "en";

        let bot = new Bot({
            "token": this.botToken
        });

        bot.on('message', data => {
            console.log(data);
            if (data.type === "message" && data.subtype !== "bot_message") {

                if (data.channel.startsWith("D")) {
                    this.parseDirectMessage(data);

                } else if (!data.text.includes(this.botId)) {
                    this.getChannelFromId(this.makeHandlerObject(data.user, data.text, data.channel));
                }
            } else if (data.type === "channel_joined" && !data.channel.name_normalized.includes("_translated")) {
                this.sendWelcomeMessage(data);
                this.createChannel(data.channel.name_normalized + "_translated");
            }
        });

        this.getIsPayed();
    }

    parseDirectMessage(data) {
        let bot = new Bot({
            "token": this.botToken
        });

        this.getInfoFromUserId(data.user, username => {
            console.log(username);
            if (data.text === "help") {
                bot.postMessageToUser(username,
                    `Hi! You can invite me to any public channel and I'll start translating everything people say there.\n\nBy default I translate everything in to english. To change this type "change" followed by the language code you want to set.  For example to change the language to German type\n\n*change de*\n\nThanks!`);
            } else if (data.text.includes("change")) {
                let lang = data.text.split(" ")[1];

                if (lang != undefined) {
                    this.toLang = lang;
                    bot.postMessageToUser(username, `You have changed the default language to ${getLanguage(lang)}.`);
                }
            }
        });
    }

    sendWelcomeMessage(data) {
        bot.postMessageToChannel(data.channel.name_normalized,
            `Hi! I'm TranslatorBot... *Beep Boop*.\n\n

            I'm a robot that tries to translate everything that happens on Slack in to a language everyone can understand.
            I've just made a channel called *${data.channel.name_normalized + "_translated"}* where I'll attempt to translate everything.\n\n
            
            Anything you type in that channel I'll also translate back in to the original language. Give it a go!`
        );
    }

    makeHandlerObject(id, text, channel) {
        let obj = {
            userId: id,
            originalText: text,
            fromChannel: channel
        };

        if (channel.includes("_translated")) {
            obj.toChannel = channel.replace("_translated", "");
        } else {
            obj.toChannel = channel + "_translated";
        }

        return obj;
    }

    getChannelFromId(handler) {
        fetch('https://slack.com/api/channels.info?channel=' + handler.fromChannel, {
                method: 'GET',
                mode: 'cors',
                redirect: 'follow',
                headers: new Headers({
                    "Authorization": "Bearer " + this.appToken,
                    "Content-Type": "application/x-www-form-urlencoded"
                })
            })
            .then(response => response.json())
            .then(res => {
                console.log(res);

                if (res.channel.name.includes("_translated")) {
                    handler.toChannel = res.channel.name.replace("_translated", "");
                } else {
                    handler.toChannel = res.channel.name + "_translated";
                }

                this.translateText(handler);
            })
            .catch(err => console.error(err));
    }

    translateText(handler) {
        let toLang = this.toLang;

        if (!handler.toChannel.includes("_translated")) {
            toLang = this.lastLanguage;
        }

        translate(handler.originalText, {
                to: toLang
            })
            .then(res => {
                if (handler.toChannel.includes("_translated")) {
                    this.lastLanguage = res.from.language.iso;
                }

                handler.translatedText = res.text;
                handler.fromISO = res.from.language.iso;
                this.getInfoFromId(handler);
            })
            .catch(err => console.error(err));
    }

    getInfoFromUserId(id, callback) {
        fetch('https://slack.com/api/users.info?user=' + id, {
                method: 'GET',
                mode: 'cors',
                redirect: 'follow',
                headers: new Headers({
                    "Authorization": "Bearer " + this.appToken,
                    "Content-Type": "application/x-www-form-urlencoded"
                })
            })
            .then(response => response.json())
            .then(res => {
                callback(res.user.profile.display_name);
            })
            .catch(err => console.error(err));
    }

    getInfoFromId(handler) {
        fetch('https://slack.com/api/users.info?user=' + handler.userId, {
                method: 'GET',
                mode: 'cors',
                redirect: 'follow',
                headers: new Headers({
                    "Authorization": "Bearer " + this.appToken,
                    "Content-Type": "application/x-www-form-urlencoded"
                })
            })
            .then(response => response.json())
            .then(res => {
                handler.realName = res.user.profile.real_name;
                this.sendMessage(handler);
            })
            .catch(err => console.error(err));
    }

    sendMessage(handler) {
        this.getIsPayed();

        if (!this.isPayed) {
            let settings = {
                "token": this.botToken,
                "name": `TranslatorBot`
            };
            let bot2 = new Bot(settings);

            bot2.postMessageToChannel(handler.toChannel, "*You have run out of free messages or your account has been disabled.*\n\n*Please visit www.website.com to re-enable your account* ");
            return;
        }

        let settings = {
            "token": this.botToken,
            "name": `${handler.realName} (Translated from ${getLanguage(handler.fromISO)})`
        };
        let bot2 = new Bot(settings);

        bot2.postMessageToChannel(handler.toChannel, handler.translatedText);
        this.deductFreeMessage();
    }

    getIsPayed() {
        MongoClient.connect(uri, (err, client) => {
            const collection = client.db("users").collection("keys");

            collection.findOne({
                "_id": this.teamId
            }, (err, item) => {
                console.log(item);
                if (item != undefined) {
                    this.isPayed = item.isPayed ? item.isPayed : item.freeMessages > 0;
                    client.close();
                }
            });
        });
    }

    deductFreeMessage() {
        MongoClient.connect(uri, (err, client) => {
            const collection = client.db("users").collection("keys");

            let idObj = {
                "_id": this.teamId
            };

            collection.findOne(idObj, (err, item) => {
                console.log(item);
                item.freeMessages = item.freeMessages - 1;
                collection.update(idObj, item);

                client.close();
            });
        });
    }

    createChannel(name) {
        console.log("CREATE_CHANNEL");

        fetch('https://slack.com/api/channels.create', {
                method: 'POST',
                mode: 'cors',
                redirect: 'follow',
                body: JSON.stringify({
                    'name': name
                }),
                headers: new Headers({
                    "Authorization": "Bearer " + this.appToken,
                    "Content-Type": "application/json"
                })
            })
            .then(response => response.json())
            .then(j => {
                // Yay, `j` is a JavaScript object
                console.log(j);
                if (j.channel != undefined) {
                    this.joinChannel(j.channel.id);
                }
            })
            .catch(err => console.error(err));
    }

    joinChannel(channel) {
        console.log("CHANNEL ID: " + channel + " BOT ID: " + this.botId);

        fetch('https://slack.com/api/channels.invite', {
                method: 'POST',
                mode: 'cors',
                redirect: 'follow',
                body: JSON.stringify({
                    'channel': channel,
                    'user': this.botId
                }),
                headers: new Headers({
                    "Authorization": "Bearer " + this.appToken,
                    "Content-Type": "application/json"
                })
            })
            .then(response => response.json())
            .then(j => console.log("JOIN CHANNEL: " + JSON.stringify(j)))
            .catch(err => console.error(err));
    }

    getBotId(next) {
        fetch('https://slack.com/api/users.list' + (next != undefined ? '?cursor=' + next : ""), {
                method: 'GET',
                mode: 'cors',
                redirect: 'follow',
                headers: new Headers({
                    "Authorization": "Bearer " + this.appToken
                })
            })
            .then(response => response.json())
            .then(res => {
                res.members.forEach(member => {
                    if (member.real_name === "TranslatorBot") {
                        this.botId = member.id;
                        console.log("BOT ID FOUND: " + this.botId);
                        return;
                    }
                });
                if (res.response_metadata != undefined) {
                    this.getBotId(res.response_metadata.next_cursor);
                }
            })
            .catch(err => console.error(err));
    }
}

function getLanguage(iso) {
    return isoLangs[iso].name;
}

var isoLangs = {
    "ab": {
        "name": "Abkhaz",
        "nativeName": "аҧсуа"
    },
    "aa": {
        "name": "Afar",
        "nativeName": "Afaraf"
    },
    "af": {
        "name": "Afrikaans",
        "nativeName": "Afrikaans"
    },
    "ak": {
        "name": "Akan",
        "nativeName": "Akan"
    },
    "sq": {
        "name": "Albanian",
        "nativeName": "Shqip"
    },
    "am": {
        "name": "Amharic",
        "nativeName": "አማርኛ"
    },
    "ar": {
        "name": "Arabic",
        "nativeName": "العربية"
    },
    "an": {
        "name": "Aragonese",
        "nativeName": "Aragonés"
    },
    "hy": {
        "name": "Armenian",
        "nativeName": "Հայերեն"
    },
    "as": {
        "name": "Assamese",
        "nativeName": "অসমীয়া"
    },
    "av": {
        "name": "Avaric",
        "nativeName": "авар мацӀ, магӀарул мацӀ"
    },
    "ae": {
        "name": "Avestan",
        "nativeName": "avesta"
    },
    "ay": {
        "name": "Aymara",
        "nativeName": "aymar aru"
    },
    "az": {
        "name": "Azerbaijani",
        "nativeName": "azərbaycan dili"
    },
    "bm": {
        "name": "Bambara",
        "nativeName": "bamanankan"
    },
    "ba": {
        "name": "Bashkir",
        "nativeName": "башҡорт теле"
    },
    "eu": {
        "name": "Basque",
        "nativeName": "euskara, euskera"
    },
    "be": {
        "name": "Belarusian",
        "nativeName": "Беларуская"
    },
    "bn": {
        "name": "Bengali",
        "nativeName": "বাংলা"
    },
    "bh": {
        "name": "Bihari",
        "nativeName": "भोजपुरी"
    },
    "bi": {
        "name": "Bislama",
        "nativeName": "Bislama"
    },
    "bs": {
        "name": "Bosnian",
        "nativeName": "bosanski jezik"
    },
    "br": {
        "name": "Breton",
        "nativeName": "brezhoneg"
    },
    "bg": {
        "name": "Bulgarian",
        "nativeName": "български език"
    },
    "my": {
        "name": "Burmese",
        "nativeName": "ဗမာစာ"
    },
    "ca": {
        "name": "Catalan; Valencian",
        "nativeName": "Català"
    },
    "ch": {
        "name": "Chamorro",
        "nativeName": "Chamoru"
    },
    "ce": {
        "name": "Chechen",
        "nativeName": "нохчийн мотт"
    },
    "ny": {
        "name": "Chichewa; Chewa; Nyanja",
        "nativeName": "chiCheŵa, chinyanja"
    },
    "zh": {
        "name": "Chinese",
        "nativeName": "中文 (Zhōngwén), 汉语, 漢語"
    },
    "cv": {
        "name": "Chuvash",
        "nativeName": "чӑваш чӗлхи"
    },
    "kw": {
        "name": "Cornish",
        "nativeName": "Kernewek"
    },
    "co": {
        "name": "Corsican",
        "nativeName": "corsu, lingua corsa"
    },
    "cr": {
        "name": "Cree",
        "nativeName": "ᓀᐦᐃᔭᐍᐏᐣ"
    },
    "hr": {
        "name": "Croatian",
        "nativeName": "hrvatski"
    },
    "cs": {
        "name": "Czech",
        "nativeName": "česky, čeština"
    },
    "da": {
        "name": "Danish",
        "nativeName": "dansk"
    },
    "dv": {
        "name": "Divehi; Dhivehi; Maldivian;",
        "nativeName": "ދިވެހި"
    },
    "nl": {
        "name": "Dutch",
        "nativeName": "Nederlands, Vlaams"
    },
    "en": {
        "name": "English",
        "nativeName": "English"
    },
    "eo": {
        "name": "Esperanto",
        "nativeName": "Esperanto"
    },
    "et": {
        "name": "Estonian",
        "nativeName": "eesti, eesti keel"
    },
    "ee": {
        "name": "Ewe",
        "nativeName": "Eʋegbe"
    },
    "fo": {
        "name": "Faroese",
        "nativeName": "føroyskt"
    },
    "fj": {
        "name": "Fijian",
        "nativeName": "vosa Vakaviti"
    },
    "fi": {
        "name": "Finnish",
        "nativeName": "suomi, suomen kieli"
    },
    "fr": {
        "name": "French",
        "nativeName": "français, langue française"
    },
    "ff": {
        "name": "Fula; Fulah; Pulaar; Pular",
        "nativeName": "Fulfulde, Pulaar, Pular"
    },
    "gl": {
        "name": "Galician",
        "nativeName": "Galego"
    },
    "ka": {
        "name": "Georgian",
        "nativeName": "ქართული"
    },
    "de": {
        "name": "German",
        "nativeName": "Deutsch"
    },
    "el": {
        "name": "Greek, Modern",
        "nativeName": "Ελληνικά"
    },
    "gn": {
        "name": "Guaraní",
        "nativeName": "Avañeẽ"
    },
    "gu": {
        "name": "Gujarati",
        "nativeName": "ગુજરાતી"
    },
    "ht": {
        "name": "Haitian; Haitian Creole",
        "nativeName": "Kreyòl ayisyen"
    },
    "ha": {
        "name": "Hausa",
        "nativeName": "Hausa, هَوُسَ"
    },
    "he": {
        "name": "Hebrew (modern)",
        "nativeName": "עברית"
    },
    "hz": {
        "name": "Herero",
        "nativeName": "Otjiherero"
    },
    "hi": {
        "name": "Hindi",
        "nativeName": "हिन्दी, हिंदी"
    },
    "ho": {
        "name": "Hiri Motu",
        "nativeName": "Hiri Motu"
    },
    "hu": {
        "name": "Hungarian",
        "nativeName": "Magyar"
    },
    "ia": {
        "name": "Interlingua",
        "nativeName": "Interlingua"
    },
    "id": {
        "name": "Indonesian",
        "nativeName": "Bahasa Indonesia"
    },
    "ie": {
        "name": "Interlingue",
        "nativeName": "Originally called Occidental; then Interlingue after WWII"
    },
    "ga": {
        "name": "Irish",
        "nativeName": "Gaeilge"
    },
    "ig": {
        "name": "Igbo",
        "nativeName": "Asụsụ Igbo"
    },
    "ik": {
        "name": "Inupiaq",
        "nativeName": "Iñupiaq, Iñupiatun"
    },
    "io": {
        "name": "Ido",
        "nativeName": "Ido"
    },
    "is": {
        "name": "Icelandic",
        "nativeName": "Íslenska"
    },
    "it": {
        "name": "Italian",
        "nativeName": "Italiano"
    },
    "iu": {
        "name": "Inuktitut",
        "nativeName": "ᐃᓄᒃᑎᑐᑦ"
    },
    "ja": {
        "name": "Japanese",
        "nativeName": "日本語 (にほんご／にっぽんご)"
    },
    "jv": {
        "name": "Javanese",
        "nativeName": "basa Jawa"
    },
    "kl": {
        "name": "Kalaallisut, Greenlandic",
        "nativeName": "kalaallisut, kalaallit oqaasii"
    },
    "kn": {
        "name": "Kannada",
        "nativeName": "ಕನ್ನಡ"
    },
    "kr": {
        "name": "Kanuri",
        "nativeName": "Kanuri"
    },
    "ks": {
        "name": "Kashmiri",
        "nativeName": "कश्मीरी, كشميري‎"
    },
    "kk": {
        "name": "Kazakh",
        "nativeName": "Қазақ тілі"
    },
    "km": {
        "name": "Khmer",
        "nativeName": "ភាសាខ្មែរ"
    },
    "ki": {
        "name": "Kikuyu, Gikuyu",
        "nativeName": "Gĩkũyũ"
    },
    "rw": {
        "name": "Kinyarwanda",
        "nativeName": "Ikinyarwanda"
    },
    "ky": {
        "name": "Kirghiz, Kyrgyz",
        "nativeName": "кыргыз тили"
    },
    "kv": {
        "name": "Komi",
        "nativeName": "коми кыв"
    },
    "kg": {
        "name": "Kongo",
        "nativeName": "KiKongo"
    },
    "ko": {
        "name": "Korean",
        "nativeName": "한국어 (韓國語), 조선말 (朝鮮語)"
    },
    "ku": {
        "name": "Kurdish",
        "nativeName": "Kurdî, كوردی‎"
    },
    "kj": {
        "name": "Kwanyama, Kuanyama",
        "nativeName": "Kuanyama"
    },
    "la": {
        "name": "Latin",
        "nativeName": "latine, lingua latina"
    },
    "lb": {
        "name": "Luxembourgish, Letzeburgesch",
        "nativeName": "Lëtzebuergesch"
    },
    "lg": {
        "name": "Luganda",
        "nativeName": "Luganda"
    },
    "li": {
        "name": "Limburgish, Limburgan, Limburger",
        "nativeName": "Limburgs"
    },
    "ln": {
        "name": "Lingala",
        "nativeName": "Lingála"
    },
    "lo": {
        "name": "Lao",
        "nativeName": "ພາສາລາວ"
    },
    "lt": {
        "name": "Lithuanian",
        "nativeName": "lietuvių kalba"
    },
    "lu": {
        "name": "Luba-Katanga",
        "nativeName": ""
    },
    "lv": {
        "name": "Latvian",
        "nativeName": "latviešu valoda"
    },
    "gv": {
        "name": "Manx",
        "nativeName": "Gaelg, Gailck"
    },
    "mk": {
        "name": "Macedonian",
        "nativeName": "македонски јазик"
    },
    "mg": {
        "name": "Malagasy",
        "nativeName": "Malagasy fiteny"
    },
    "ms": {
        "name": "Malay",
        "nativeName": "bahasa Melayu, بهاس ملايو‎"
    },
    "ml": {
        "name": "Malayalam",
        "nativeName": "മലയാളം"
    },
    "mt": {
        "name": "Maltese",
        "nativeName": "Malti"
    },
    "mi": {
        "name": "Māori",
        "nativeName": "te reo Māori"
    },
    "mr": {
        "name": "Marathi (Marāṭhī)",
        "nativeName": "मराठी"
    },
    "mh": {
        "name": "Marshallese",
        "nativeName": "Kajin M̧ajeļ"
    },
    "mn": {
        "name": "Mongolian",
        "nativeName": "монгол"
    },
    "na": {
        "name": "Nauru",
        "nativeName": "Ekakairũ Naoero"
    },
    "nv": {
        "name": "Navajo, Navaho",
        "nativeName": "Diné bizaad, Dinékʼehǰí"
    },
    "nb": {
        "name": "Norwegian Bokmål",
        "nativeName": "Norsk bokmål"
    },
    "nd": {
        "name": "North Ndebele",
        "nativeName": "isiNdebele"
    },
    "ne": {
        "name": "Nepali",
        "nativeName": "नेपाली"
    },
    "ng": {
        "name": "Ndonga",
        "nativeName": "Owambo"
    },
    "nn": {
        "name": "Norwegian Nynorsk",
        "nativeName": "Norsk nynorsk"
    },
    "no": {
        "name": "Norwegian",
        "nativeName": "Norsk"
    },
    "ii": {
        "name": "Nuosu",
        "nativeName": "ꆈꌠ꒿ Nuosuhxop"
    },
    "nr": {
        "name": "South Ndebele",
        "nativeName": "isiNdebele"
    },
    "oc": {
        "name": "Occitan",
        "nativeName": "Occitan"
    },
    "oj": {
        "name": "Ojibwe, Ojibwa",
        "nativeName": "ᐊᓂᔑᓈᐯᒧᐎᓐ"
    },
    "cu": {
        "name": "Old Church Slavonic, Church Slavic, Church Slavonic, Old Bulgarian, Old Slavonic",
        "nativeName": "ѩзыкъ словѣньскъ"
    },
    "om": {
        "name": "Oromo",
        "nativeName": "Afaan Oromoo"
    },
    "or": {
        "name": "Oriya",
        "nativeName": "ଓଡ଼ିଆ"
    },
    "os": {
        "name": "Ossetian, Ossetic",
        "nativeName": "ирон æвзаг"
    },
    "pa": {
        "name": "Panjabi, Punjabi",
        "nativeName": "ਪੰਜਾਬੀ, پنجابی‎"
    },
    "pi": {
        "name": "Pāli",
        "nativeName": "पाऴि"
    },
    "fa": {
        "name": "Persian",
        "nativeName": "فارسی"
    },
    "pl": {
        "name": "Polish",
        "nativeName": "polski"
    },
    "ps": {
        "name": "Pashto, Pushto",
        "nativeName": "پښتو"
    },
    "pt": {
        "name": "Portuguese",
        "nativeName": "Português"
    },
    "qu": {
        "name": "Quechua",
        "nativeName": "Runa Simi, Kichwa"
    },
    "rm": {
        "name": "Romansh",
        "nativeName": "rumantsch grischun"
    },
    "rn": {
        "name": "Kirundi",
        "nativeName": "kiRundi"
    },
    "ro": {
        "name": "Romanian, Moldavian, Moldovan",
        "nativeName": "română"
    },
    "ru": {
        "name": "Russian",
        "nativeName": "русский язык"
    },
    "sa": {
        "name": "Sanskrit (Saṁskṛta)",
        "nativeName": "संस्कृतम्"
    },
    "sc": {
        "name": "Sardinian",
        "nativeName": "sardu"
    },
    "sd": {
        "name": "Sindhi",
        "nativeName": "सिन्धी, سنڌي، سندھی‎"
    },
    "se": {
        "name": "Northern Sami",
        "nativeName": "Davvisámegiella"
    },
    "sm": {
        "name": "Samoan",
        "nativeName": "gagana faa Samoa"
    },
    "sg": {
        "name": "Sango",
        "nativeName": "yângâ tî sängö"
    },
    "sr": {
        "name": "Serbian",
        "nativeName": "српски језик"
    },
    "gd": {
        "name": "Scottish Gaelic; Gaelic",
        "nativeName": "Gàidhlig"
    },
    "sn": {
        "name": "Shona",
        "nativeName": "chiShona"
    },
    "si": {
        "name": "Sinhala, Sinhalese",
        "nativeName": "සිංහල"
    },
    "sk": {
        "name": "Slovak",
        "nativeName": "slovenčina"
    },
    "sl": {
        "name": "Slovene",
        "nativeName": "slovenščina"
    },
    "so": {
        "name": "Somali",
        "nativeName": "Soomaaliga, af Soomaali"
    },
    "st": {
        "name": "Southern Sotho",
        "nativeName": "Sesotho"
    },
    "es": {
        "name": "Spanish; Castilian",
        "nativeName": "español, castellano"
    },
    "su": {
        "name": "Sundanese",
        "nativeName": "Basa Sunda"
    },
    "sw": {
        "name": "Swahili",
        "nativeName": "Kiswahili"
    },
    "ss": {
        "name": "Swati",
        "nativeName": "SiSwati"
    },
    "sv": {
        "name": "Swedish",
        "nativeName": "svenska"
    },
    "ta": {
        "name": "Tamil",
        "nativeName": "தமிழ்"
    },
    "te": {
        "name": "Telugu",
        "nativeName": "తెలుగు"
    },
    "tg": {
        "name": "Tajik",
        "nativeName": "тоҷикӣ, toğikī, تاجیکی‎"
    },
    "th": {
        "name": "Thai",
        "nativeName": "ไทย"
    },
    "ti": {
        "name": "Tigrinya",
        "nativeName": "ትግርኛ"
    },
    "bo": {
        "name": "Tibetan Standard, Tibetan, Central",
        "nativeName": "བོད་ཡིག"
    },
    "tk": {
        "name": "Turkmen",
        "nativeName": "Türkmen, Түркмен"
    },
    "tl": {
        "name": "Tagalog",
        "nativeName": "Wikang Tagalog, ᜏᜒᜃᜅ᜔ ᜆᜄᜎᜓᜄ᜔"
    },
    "tn": {
        "name": "Tswana",
        "nativeName": "Setswana"
    },
    "to": {
        "name": "Tonga (Tonga Islands)",
        "nativeName": "faka Tonga"
    },
    "tr": {
        "name": "Turkish",
        "nativeName": "Türkçe"
    },
    "ts": {
        "name": "Tsonga",
        "nativeName": "Xitsonga"
    },
    "tt": {
        "name": "Tatar",
        "nativeName": "татарча, tatarça, تاتارچا‎"
    },
    "tw": {
        "name": "Twi",
        "nativeName": "Twi"
    },
    "ty": {
        "name": "Tahitian",
        "nativeName": "Reo Tahiti"
    },
    "ug": {
        "name": "Uighur, Uyghur",
        "nativeName": "Uyƣurqə, ئۇيغۇرچە‎"
    },
    "uk": {
        "name": "Ukrainian",
        "nativeName": "українська"
    },
    "ur": {
        "name": "Urdu",
        "nativeName": "اردو"
    },
    "uz": {
        "name": "Uzbek",
        "nativeName": "zbek, Ўзбек, أۇزبېك‎"
    },
    "ve": {
        "name": "Venda",
        "nativeName": "Tshivenḓa"
    },
    "vi": {
        "name": "Vietnamese",
        "nativeName": "Tiếng Việt"
    },
    "vo": {
        "name": "Volapük",
        "nativeName": "Volapük"
    },
    "wa": {
        "name": "Walloon",
        "nativeName": "Walon"
    },
    "cy": {
        "name": "Welsh",
        "nativeName": "Cymraeg"
    },
    "wo": {
        "name": "Wolof",
        "nativeName": "Wollof"
    },
    "fy": {
        "name": "Western Frisian",
        "nativeName": "Frysk"
    },
    "xh": {
        "name": "Xhosa",
        "nativeName": "isiXhosa"
    },
    "yi": {
        "name": "Yiddish",
        "nativeName": "ייִדיש"
    },
    "yo": {
        "name": "Yoruba",
        "nativeName": "Yorùbá"
    },
    "za": {
        "name": "Zhuang, Chuang",
        "nativeName": "Saɯ cueŋƅ, Saw cuengh"
    }
};

module.exports = TranslatorBot;