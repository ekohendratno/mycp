const express = require("express");
const session = require("express-session");
const path = require("path");
const config = require("./config");

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "views"));
app.use("/assets", express.static(path.join(__dirname, "..", "assets")));
app.use(express.json());

app.use(session({
  secret: config.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: config.SESSION_MAX_AGE },
}));

require("./routes/views")(app);
require("./routes/auth")(app);
require("./routes/sites")(app);
require("./routes/phpmyadmin")(app);
require("./routes/preview")(app);
require("./routes/php")(app);
require("./routes/vhost")(app);
require("./routes/ssl")(app);
require("./routes/files")(app);
require("./routes/databases")(app);
require("./routes/cron")(app);
require("./routes/ftp")(app);
require("./routes/logs")(app);
require("./routes/services")(app);
require("./routes/pm2")(app);
require("./routes/server")(app);
require("./routes/update")(app);

module.exports = app;
