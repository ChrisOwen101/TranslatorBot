/*jshint esversion: 6 */

const express = require('express');
const fetch = require("node-fetch");
const TranslatorBot = require('./translator_bot.js');

var clientId = process.env.CLIENT_ID.trim();
var clientSecret = process.env.CLIENT_SECRET.trim();

var app = express();
var port = process.env.PORT || 8080;

app.get('/oauth', function (req, res) {
    res.send('Hello Seattle\n');
    let code = req.param('code');
    let state = req.param('state');
    getOauthToken(clientId, clientSecret, code);

});
app.listen(port);


function getOauthToken(clientId, clientSecret, code) {
    fetch('https://slack.com/api/oauth.access?client_id=' + clientId + "&client_secret=" + clientSecret + "&code=" + code, {
            method: 'POST',
            mode: 'cors',
            redirect: 'follow',
            headers: new Headers({
                "Authorization": "Bearer " + this.appToken,
                "Content-Type": "application/x-www-form-urlencoded"
            })
        })
        .then(function (response) {
            // Convert to JSON
            return response.json();
        })
        .then(res => {
            console.log(JSON.stringify(res));
            new TranslatorBot(res.access_token, res.bot.bot_access_token);

        })
        .catch(err => {
            console.error(err);
        });
}