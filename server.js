var fuzIsOpen = false;
var lastSeen = new Date("1970-01-01");

const fs = require("fs");
const db = "./.data/data.json";

try {
  var content = fs.readFileSync(db, "utf8");
  fuzIsOpen = JSON.parse(content)["fuzIsOpen"];
  lastSeen = new Date(JSON.parse(content)["lastSeen"]);
} catch (err) {}

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
  res.send({ fuzIsOpen, lastSeen });
});

// http://expressjs.com/en/starter/basic-routing.html
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
  fuzIsOpen = req.query.fuzisopen == "1";
  lastSeen = new Date();
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
