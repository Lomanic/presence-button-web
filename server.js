var fuzIsOpen = false;
var lastSeen = new Date("1970-01-01");
var lastNofified = new Date("1970-01-01");
var lastClosed = new Date("1970-01-01");

const fs = require("fs");
const db = "./.data/data.json";

try {
  var content = fs.readFileSync(db, "utf8");
  fuzIsOpen = JSON.parse(content)["fuzIsOpen"] || fuzIsOpen;
  lastSeen = new Date(JSON.parse(content)["lastSeen"] || lastSeen);
  lastNofified = new Date(JSON.parse(content)["lastNofified"] || lastNofified);
  lastClosed = new Date(JSON.parse(content)["lastClosed"] || lastClosed);
} catch (err) {}

const express = require("express");
const app = express();

app.use(express.static("public"));

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/views/index.html");
});

app.get("/img", (req, res) => {
  if (fuzIsOpen && new Date() - 2 * 60 * 1000 < lastSeen) {
    return res.sendFile(__dirname + "/views/open.svg"); // https://www.flaticon.com/free-icon/open_1234189
  }
  res.sendFile(__dirname + "/views/closed.svg"); // https://www.flaticon.com/free-icon/closed_1234190
});

app.get("/api", (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  res.send({ fuzIsOpen, lastSeen, lastClosed });
});

app.get("/status", (req, res) => {
  // http basic auth handling without 3rd-party lib https://stackoverflow.com/a/33905671
  const auth = {
    login: process.env.MATRIXUSERNAME,
    password: process.env.MATRIXPASSWORD
  };

  // parse login and password from headers
  const b64auth = (req.headers.authorization || "").split(" ")[1] || "";
  const [_, login, password] =
    new Buffer(b64auth, "base64").toString().match(/(.*):(.*)/) || []; // slightly modified as we use : in username

  if (
    !login ||
    !password ||
    login !== auth.login ||
    password !== auth.password
  ) {
    console.log(login, password);
    res.set("WWW-Authenticate", 'Basic realm="Authentication required"');
    return res.status(401).send("Authentication required.");
  }
  fuzIsOpen = req.query.fuzisopen === "1";
  lastSeen = new Date();
  try {
    fs.writeFileSync(db, JSON.stringify({ fuzIsOpen, lastSeen, lastClosed }));
  } catch (err) {}

  res.sendStatus(200);
});

const listener = app.listen(process.env.PORT, function() {
  console.log("Your app is listening on port " + listener.address().port);
});

const loop = () => {
  console.log("loop", lastClosed);
  if (lastSeen < new Date() - 2 * 60 * 1000 && lastClosed < lastSeen) {
    // the Fuz is newly closed, notify on matrix and write file to survive reboot
    lastClosed = new Date();
    //lastNofified = new Date();
    //https.post ... send message to Fuz process.env.MATRIXROOM
    try {
      fs.writeFileSync(db, JSON.stringify({ fuzIsOpen, lastSeen, lastClosed }));
    } catch (err) {}
  }

  setTimeout(loop, 10 * 1000);
};
setTimeout(loop, 1 * 1000); // give some time for presence button to show up (1 min)

if (process.env.PROJECT_DOMAIN != "") {
  process.on("SIGTERM", function() {
    console.log("SIGTERM received, sending SOS to Resurrect...");
    require("https").get(
      "https://resurrect.glitch.me/" + process.env.PROJECT_DOMAIN + "",
      process.exit
    );
  });
}
