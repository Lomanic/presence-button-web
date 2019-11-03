var fuzIsOpen = false;
var lastSeen = new Date("1970-01-01");

const fs = require("fs");
const db = "./.data/data.json";

try {
  var content = fs.readFileSync(db, "utf8");
  fuzIsOpen = JSON.parse(content)["fuzIsOpen"];
  lastSeen = new Date(JSON.parse(content)["lastSeen"]);
} catch (err) {}

console.log(JSON.stringify({ fuzIsOpen, lastSeen }));
const express = require("express");
const app = express();

// http://expressjs.com/en/starter/static-files.html
app.use(express.static("public"));

// http://expressjs.com/en/starter/basic-routing.html
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/views/index.html");
});

// http://expressjs.com/en/starter/basic-routing.html
app.get("/img", (req, res) => {
  res.sendFile(__dirname + "/views/index.html");
  if (fuzIsOpen && Date() - 5 * 60 * 1000 < lastSeen) {
    
  }
});
app.get("/api", (req, res) => {
  res.send(fuzIsOpen && Date() - 5 * 1000 < lastSeen)
});

// http://expressjs.com/en/starter/basic-routing.html
app.get("/status", (req, res) => {
  if (req.query.password !== process.env.PASSWORD) {
    return res.sendStatus(401);
  }
  fuzIsOpen = req.query.fuzisopen === "1";
  lastSeen = Date();
  try {
    fs.writeFileSync(db, JSON.stringify({ fuzIsOpen, lastSeen }));
  } catch (err) {}

  res.sendStatus(200);
});

const listener = app.listen(process.env.PORT, function() {
  console.log("Your app is listening on port " + listener.address().port);
});

process.on("SIGTERM", function() {
  console.log("SIGTERM received, sending SOS to Resurrect...");
  require("https").get(
    "https://resurrect.glitch.me/" + process.env.PROJECT_DOMAIN + "",
    process.exit
  );
});
