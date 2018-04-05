/*jshint esversion: 6 */

const express = require('express');
const fetch = require("node-fetch");
const TranslatorBot = require('./translator_bot.js');
const MongoClient = require('mongodb').MongoClient;
const uri = "mongodb+srv://ChrisOwen101:hacktheplanet@translatorbot-izwur.mongodb.net/test";


var clientId = process.env.CLIENT_ID.trim();
var clientSecret = process.env.CLIENT_SECRET.trim();

var localOAuth = process.env.APP_TOKEN.trim();
var localBotOAuth = process.env.TOKEN.trim();

var app = express();
var port = process.env.PORT || 8080;

if (localOAuth != null && localBotOAuth != null) {
    new TranslatorBot(localOAuth, localBotOAuth);
    saveToMongo(localOAuth, localBotOAuth, "123");
}

app.get('/oauth', function (req, res) {
    res.send('You have now added TranslatorBot to your workspace.\nIn Slack, you can invite "TranslatorBot" to any channel to have him start translating messages.');
    let code = req.param('code');
    let state = req.param('state');
    getOauthToken(clientId, clientSecret, code);

});
app.listen(port);

function getOauthToken(clientId, clientSecret, code) {
    let data = {
        "client_id": clientId,
        "client_secret": clientSecret,
        "code": code
    };

    fetch('https://slack.com/api/oauth.access?' + encodeQueryData(data), {
            method: 'POST',
            mode: 'cors',
            redirect: 'follow',
            headers: new Headers({
                "Content-Type": "application/x-www-form-urlencoded"
            })
        })
        .then(function (response) {
            // Convert to JSON
            return response.json();
        })
        .then(res => {
            console.log(JSON.stringify(res));
            new TranslatorBot(res.access_token, res.bot.bot_access_token, res.bot.bot_user_id);
            saveToMongo(res.access_token, res.bot.bot_access_token, res.bot.bot_user_id);

        })
        .catch(err => {
            console.error(err);
        });
}

function saveToMongo(accessToken, accessBotToken, botId) {
    let obj = {
        "accessToken": accessToken,
        "accessBotToken": accessBotToken,
        "botId": botId
    };

    MongoClient.connect(uri, function (err, client) {
        const collection = client.db("users").collection("keys");

        collection.insert(obj, function (err, result) {
            console.log(err);
            console.log(result);
        });

        // perform actions on the collection object
        client.close();
    });
}

function encodeQueryData(data) {
    let ret = [];
    for (let d in data)
        ret.push(encodeURIComponent(d) + '=' + encodeURIComponent(data[d]));
    return ret.join('&');
}