/*jshint esversion: 6 */

var token = process.env.BOT_API_KEY.trim();
var appToken = process.env.APP_API_KEY.trim();

console.log("Bot token:" + token);
console.log("App token:" + appToken);

const fetch = require("node-fetch");
global.Headers = fetch.Headers;

var Bot = require('slackbots');
const translate = require('google-translate-api');

// create a bot
var settings = {
    "token": token
};
var bot = new Bot(settings);

bot.on('message', function(data) {
    // all ingoing events https://api.slack.com/rtm
    console.log(data);

    if (data.type === "message" && data.subtype !== "bot_message") {
        translateText(data.user, data.text);
    } else if (data.type === "channel_joined") {
        createChannel(data.channel.name_normalized + "_translated");
    }
});

function translateText(user, text) {
    translate(text, {
            to: 'en'
        })
        .then(res => {
            getInfoFromId(user, res.text, res.from.language.iso);
        })
        .catch(err => {
            console.error(err);
        });
}

function getInfoFromId(id, text, iso) {
    fetch('https://slack.com/api/users.info?user=' + id, {
            method: 'GET',
            mode: 'cors',
            redirect: 'follow',
            headers: new Headers({
                "Authorization": "Bearer " + appToken,
                "Content-Type": "application/x-www-form-urlencoded"
            })
        })
        .then(function(response) {
            // Convert to JSON
            return response.json();
        })
        .then(res => {
            console.log(res);
            var settings = {
                "token": token,
                "name": res.user.profile.real_name + " (Translated from " + iso + ")"
            };
            var bot2 = new Bot(settings);

            bot2.postMessageToChannel("testbot_translated", text);
        })
        .catch(err => {
            console.error(err);
        });
}

function createChannel(name) {
    fetch('https://slack.com/api/channels.create', {
            method: 'POST',
            mode: 'cors',
            redirect: 'follow',
            body: JSON.stringify({
                'name': name
            }),
            headers: new Headers({
                "Authorization": "Bearer " + appToken,
                "Content-Type": "application/json"
            })
        })
        .then(function(response) {
            // Convert to JSON
            return response.json();
        }).then(function(j) {
            // Yay, `j` is a JavaScript object
            console.log(j);
        }).catch((error) => {
            console.log(error);
        });
}