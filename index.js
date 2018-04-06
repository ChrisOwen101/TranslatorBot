/*jshint esversion: 6 */

//Required Libs
const express = require('express');
const fetch = require("node-fetch");
const TranslatorBot = require('./translator_bot.js');
const MongoClient = require('mongodb').MongoClient;

const clientId = process.env.CLIENT_ID.trim();
const clientSecret = process.env.CLIENT_SECRET.trim();

const dbUser = process.env.DB_USER.trim();
const dbPass = process.env.DB_PASS.trim();
const uri = `mongodb+srv://${dbUser}:${dbPass}@translatorbot-izwur.mongodb.net/test`;

// var localOAuth = process.env.APP_TOKEN.trim();
// var localBotOAuth = process.env.TOKEN.trim();

// if (localOAuth != null && localBotOAuth != null) {
//     new TranslatorBot(localOAuth, localBotOAuth);
//     saveToMongo(localOAuth, localBotOAuth, "123");
// }


readAllFromMongo();

const app = express();
app.get('/oauth', function (req, res) {
    res.send('You have now added TranslatorBot to your workspace.\n\nIn Slack, you can invite "TranslatorBot" to any channel to have him start translating messages.');
    let code = req.param('code');
    getOauthToken(clientId, clientSecret, code);
});
app.listen(process.env.PORT || 8080);

function getOauthToken(clientId, clientSecret, code) {
    let data = {
        "client_id": clientId,
        "client_secret": clientSecret,
        "code": code
    };

    fetch(`https://slack.com/api/oauth.access?${encodeQueryData(data)}`, {
            method: 'POST',
            mode: 'cors',
            redirect: 'follow',
            headers: new Headers({
                "Content-Type": "application/x-www-form-urlencoded"
            })
        })
        .then(response => response.json())
        .then(res => {
            console.log(JSON.stringify(res));
            new TranslatorBot(res.access_token, res.bot.bot_access_token, res.bot.bot_user_id);
            saveToMongo(res.access_token, res.bot.bot_access_token, res.bot.bot_user_id);

        })
        .catch(err => console.error(err));
}

function readAllFromMongo() {
    MongoClient.connect(uri, (err, client) => {
        const collection = client.db("users").collection("keys");

        var stream = collection.find().stream();
        stream.on('data', doc => new TranslatorBot(doc.accessToken, doc.accessBotToken, doc.botId));
        stream.on('error', err => console.log(err));
        stream.on('end', () => client.close());
    });
}

function saveToMongo(accessToken, accessBotToken, botId) {
    let obj = {
        "_id": accessToken,
        "accessToken": accessToken,
        "accessBotToken": accessBotToken,
        "botId": botId
    };

    MongoClient.connect(uri, (err, client) => {
        const collection = client.db("users").collection("keys");

        collection.save(obj, {
            w: 1
        }, (err, result) => client.close());
    });
}

function encodeQueryData(data) {
    let ret = [];
    for (let d in data)
        ret.push(encodeURIComponent(d) + '=' + encodeURIComponent(data[d]));
    return ret.join('&');
}