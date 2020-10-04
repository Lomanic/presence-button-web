const express = require("express");
const app = express();
const request = require("request");

var fuzIsOpen = false;
var lastSeen = new Date("1970-01-01");
var lastOpened = new Date("1970-01-01");
var lastClosed = new Date("1970-01-01");

const fs = require("fs");
const path = require("path");
const db = "./.data/data.json";
const defaultClosingTimeout = 5 * 60 * 1000; // 5 mins

try {
  fs.mkdirSync(path.dirname(db), { recursive: true });
} catch (err) {}
try {
  var content = fs.readFileSync(db, "utf8");
  
  fuzIsOpen = JSON.parse(content)["fuzIsOpen"] || fuzIsOpen;
  lastSeen = new Date(JSON.parse(content)["lastSeen"] || lastSeen);
  lastOpened = new Date(JSON.parse(content)["lastOpened"] || lastOpened);
  lastClosed = new Date(JSON.parse(content)["lastClosed"] || lastClosed);
} catch (err) {console.log("err", err)}

app.use(express.static("public"));
app.enable("trust proxy"); // needed for HTTP -> HTTPS redirect and successful test against req.secure

// redirect every route but /status as it's used by the ESP to send its status https://stackoverflow.com/a/49176816
const redirectToHTTPS = (req, res, next) => {
  if (req.secure) {
    // request was via https, so do no special handling
    next();
  } else {
    // request was via http, so redirect to https
    res.redirect("https://" + req.headers.host + req.originalUrl);
  }
};
app.use("/api", redirectToHTTPS);
app.use("/img", redirectToHTTPS);

app.all("/", redirectToHTTPS); // no app.use here because it would match every path https://github.com/expressjs/express/issues/3260
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/views/index.html");
});

app.get("/img", (req, res) => {
  const closingTimeout = (typeof req.query.closingTimeout !== 'undefined')? req.query.closingTimeout : defaultClosingTimeout;
  res.header(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  res.header("Pragma", "no-cache");
  res.header("Expires", "0");
  if (fuzIsOpen && new Date() - closingTimeout < lastSeen) {
    // https://www.iconfinder.com/icons/1871431/online_open_shop_shopping_sign_icon
    // formerly https://www.flaticon.com/free-icon/open_1234189, maybe try https://flaticons.net/customize.php?dir=Miscellaneous&icon=Open.png without attribution
    return res.sendFile(__dirname + "/views/open.svg");
  }
  // https://www.iconfinder.com/icons/1871435/closed_online_shop_shopping_sign_icon
  // formerly https://www.flaticon.com/free-icon/closed_1234190, maybe try https://flaticons.net/customize.php?dir=Miscellaneous&icon=Closed.png without attribution
  res.sendFile(__dirname + "/views/closed.svg");
});

app.get("/api", (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  res.header("Content-Type", "application/json");
  res.send(
    JSON.stringify(
      {
        fuzIsOpen,
        lastSeen,
        lastOpened,
        lastClosed,
        processUptime: formatSeconds(process.uptime())
      },
      null,
      4
    )
  );
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
    res.set("WWW-Authenticate", 'Basic realm="Authentication required"');
    return res.status(401).send("Authentication required.");
  }
  fuzIsOpen = req.query.fuzisopen === "1";
  lastSeen = new Date();
  try {
    fs.writeFileSync(db, JSON.stringify({ fuzIsOpen, lastSeen, lastOpened, lastClosed }));
  } catch (err) {}

  res.sendStatus(200);
  if (
    fuzIsOpen &&
    lastOpened < lastClosed
  ) {
    // the Fuz is newly opened, notify on matrix and write file to survive reboot
    request.put(
      {
        url:
          "https://" +
          process.env.MATRIXUSERNAME.substring(
            process.env.MATRIXUSERNAME.indexOf(":") + 1
          ) +
          "/_matrix/client/r0/rooms/" +
          process.env.MATRIXROOM +
          "/send/m.room.message/" +
          new Date().getTime() +
          "?access_token=" +
          accessToken +
          "&limit=1",
        body: JSON.stringify({
          msgtype: "m.text",
          body:
            (new Date().getDay() === 3 ? "C'est Fuzcredi ! " : "") + process.env.MATRIXOPENINGMESSAGE
        }),
        headers: {
          "Content-Type": "application/json"
        }
      },
      function(error, response, body2) {
        if (!error) {
          try {
            lastOpened = new Date();
            fs.writeFileSync(
              db,
              JSON.stringify({ fuzIsOpen, lastSeen, lastOpened, lastClosed })
            );
          } catch (err) {}
        }
        console.log(body2);
      }
    );
  }
});

const listener = app.listen(process.env.PORT, function() {
  console.log("Your app is listening on port " + listener.address().port);
});


const accessToken = process.env.MATRIXACCESSTOKEN;
const loop = () => {
  console.log("loop", JSON.stringify({ fuzIsOpen, lastSeen, lastOpened, lastClosed }));
  if (
    //fuzIsOpen &&
    lastSeen < new Date() - defaultClosingTimeout &&
    lastClosed < lastSeen
  ) {
    // the Fuz is newly closed, notify on matrix and write file to survive reboot
    //https.put ... send message to Fuz process.env.MATRIXROOM
    request.put(
      {
        url:
          "https://" +
          process.env.MATRIXUSERNAME.substring(
            process.env.MATRIXUSERNAME.indexOf(":") + 1
          ) +
          "/_matrix/client/r0/rooms/" +
          process.env.MATRIXROOM +
          "/send/m.room.message/" +
          new Date().getTime() +
          "?access_token=" +
          accessToken +
          "&limit=1",
        body: JSON.stringify({
          msgtype: "m.text",
          body:
            process.env.MATRIXCLOSINGMESSAGE +
            (fuzIsOpen ? "" : " (crash, oubli, passage bref…)")
        }),
        headers: {
          "Content-Type": "application/json"
        }
      },
      function(error, response, body2) {
        if (!error) {
          try {
            lastClosed = new Date();
            fs.writeFileSync(
              db,
              JSON.stringify({ fuzIsOpen, lastSeen, lastOpened, lastClosed })
            );
          } catch (err) {}
        }
        console.log(body2);
        setTimeout(loop, 10 * 1000);
      }
    );
  } else {
    setTimeout(loop, 10 * 1000);
  }
};
setTimeout(loop, 1 * 60 * 1000); // give some time for presence button to show up (1 min)

const formatSeconds = function (seconds) { // https://stackoverflow.com/a/13368349
  var seconds = Math.floor(seconds),
      hours = Math.floor(seconds / 3600);
  seconds -= hours*3600;
  var minutes = Math.floor(seconds / 60);
  seconds -= minutes*60;

  if (hours   < 10) {hours   = "0"+hours;}
  if (minutes < 10) {minutes = "0"+minutes;}
  if (seconds < 10) {seconds = "0"+seconds;}
  return hours+':'+minutes+':'+seconds;
}

if (process.env.PROJECT_DOMAIN != "") {
  process.on("SIGTERM", function() {
    console.log("SIGTERM received, sending SOS to Resurrect...");
    require("https").get(
      "https://resurrect.glitch.me/" + process.env.PROJECT_DOMAIN + "",
      process.exit
    );
  });
}
