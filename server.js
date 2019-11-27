const express = require("express");
const app = express();
const request = require("request");

var fuzIsOpen = false;
var lastSeen = new Date("1970-01-01");
var lastNofified = new Date("1970-01-01");
var lastClosed = new Date("1970-01-01");

const fs = require("fs");
const db = "./.data/data.json";
const closingTimeout = 600 * 60 * 1000; // 5 mins

try {
  var content = fs.readFileSync(db, "utf8");
  fuzIsOpen = JSON.parse(content)["fuzIsOpen"] || fuzIsOpen;
  lastSeen = new Date(JSON.parse(content)["lastSeen"] || lastSeen);
  lastNofified = new Date(JSON.parse(content)["lastNofified"] || lastNofified);
  lastClosed = new Date(JSON.parse(content)["lastClosed"] || lastClosed);
} catch (err) {}

app.use(express.static("public"));

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/views/index.html");
});

app.get("/img", (req, res) => {
  res.header(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  res.header("Pragma", "no-cache");
  res.header("Expires", "0");
  if (fuzIsOpen && new Date() - closingTimeout < lastSeen) {
    return res.sendFile(__dirname + "/views/open.svg"); // https://www.flaticon.com/free-icon/open_1234189, maybe try https://flaticons.net/customize.php?dir=Miscellaneous&icon=Open.png without attribution
  }
  res.sendFile(__dirname + "/views/closed.svg"); // https://www.flaticon.com/free-icon/closed_1234190, maybe try https://flaticons.net/customize.php?dir=Miscellaneous&icon=Closed.png without attribution
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

request.post(
  {
    url:
      "https://" +
      process.env.MATRIXUSERNAME.substring(
        process.env.MATRIXUSERNAME.indexOf(":") + 1
      ) +
      "/_matrix/client/r0/login",
    body: JSON.stringify({
      type: "m.login.password",
      user: process.env.MATRIXUSERNAME.substring(
        0,
        process.env.MATRIXUSERNAME.indexOf(":")
      ),
      password: process.env.MATRIXPASSWORD,
      identifier: {
        type: "m.id.user",
        user: process.env.MATRIXUSERNAME.substring(
          0,
          process.env.MATRIXUSERNAME.indexOf(":")
        )
      }
    }),
    headers: {
      "Content-Type": "application/json"
    }
  },
  function(error, response, body) {
    console.log(body);
    const accessToken = JSON.parse(body)["access_token"];
    const loop = () => {
      console.log("loop", lastClosed);
      if (
        fuzIsOpen &&
        lastSeen < new Date() - closingTimeout &&
        lastClosed < lastSeen
      ) {
        // the Fuz is newly closed, notify on matrix and write file to survive reboot
        //https.post ... send message to Fuz process.env.MATRIXROOM
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
              body: process.env.MATRIXMESSAGE
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
                  JSON.stringify({ fuzIsOpen, lastSeen, lastClosed })
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
  }
);

if (process.env.PROJECT_DOMAIN != "") {
  process.on("SIGTERM", function() {
    console.log("SIGTERM received, sending SOS to Resurrect...");
    require("https").get(
      "https://resurrect.glitch.me/" + process.env.PROJECT_DOMAIN + "",
      process.exit
    );
  });
}
