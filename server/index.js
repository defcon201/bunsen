const express = require('express');
const fs = require('fs-extra')
const util = require('util')
const exec = util.promisify(require('child_process').exec)
const path = require('path')

// Set up app.
var app = express();

var map = {}

app.get('/open/:uuid', async function (req, res) {
  console.log('hi')
  try {
    await exec(`cd archives && dat clone ${req.params.uuid}`)
  } catch (e) {
    return res.send(e)
  }
  const shortName = req.params.uuid.substr(0, 6)
  map[shortName] = req.params.uuid
  res.redirect(`http://${shortName}.lvh.me`)
  res.send('ok')
})

// Intercept all routes.
app.all('*', function (req, res) {
  // Get shortname from subdomain on *.lvh.me.
  const shortName = req.headers.host.split('.')[0]
  const folder = map[shortName]
  return express.static(path.join(__dirname, 'archives', folder)).apply(this, arguments);
});

// Listen to on port 80.
app.listen(80, function () {
  console.log('Proxy is listening on port 80');
});
