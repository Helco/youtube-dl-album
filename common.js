var http = require("http");
var https = require("https");
var fs = require("fs");
var url = require("url");
var process = require("process");
var path = require("path");
var child_process = require("child_process");

/**
 * Creates a directory and all parent directories without any noise
 * @param {string} p the directory to create
 */
function mkdirSilent(p) {
    var parts = path.normalize(p).split("/");
    var act = "";
    parts.forEach(function (val, i) {
        act += (i > 0 ? "/" : "") + val;
        if (!fs.existsSync(act))
            fs.mkdirSync(act);
    });
}

/**
 * Downloads a file using http or https, also regards redirections.
 * @param {string} urlString URL of the file to download
 * @param {object} [headers] Object of headers to send with the request
 * @param {function} callback Function taking optional error and resulting response object
 * @param {function} [redirCb] Function if redirect occurs taking the statuscode and the new location
 */
function download (urlString, headers, callback, redirCb) {
    var REDIRECT_STATUSES = [301, 302, 303, 307, 308];

    // Preprocessing arguments
    if (typeof headers === "function") {
        redirCb = callback;
        callback = headers;
        headers = null;
    }
    if (typeof redirCb !== "function")
        redirCb = (_, newLocation) => download(newLocation, headers, callback);

    // Choosing protocol module
    var urlObj = url.parse(urlString);
    urlObj.header = headers;
    var mod = null;
    if (urlObj.protocol === "http:")
        mod = http;
    else if (urlObj.protocol === "https:")
        mod = https;
    else
        callback("Invalid protocol", null);

    // Sending the request
    mod.request(urlObj, function(res) {
        if (!res)
            callback("Unknown request failure", null);
        else if (REDIRECT_STATUSES.indexOf(res.statusCode) >= 0)
            redirCb(res.statusCode, res.headers.location);
        else if (res.statusCode != 200)
            callback("HTTP status code: " + res.statusCode, null);
        else
            callback(null, res);
    }).on("error", function(e) {
        callback(e ? "Request error: " + e : "Unknown request failure");
    }).end();
}

/**
 * Downloads a file as text using http or https, also regards redirections.
 * @param {string} urlString URL of the file to download
 * @param {object} [headers] Object of headers to send with the request
 * @param {function} callback Function taking optional error and resulting text
 * @param {function} [redirCb] Function if redirect occurs taking the statuscode and the new location
 */
function downloadText(urlString, headers, callback, redirCb) {
    if (typeof headers === "function") {
        redirCb = callback;
        callback = headers;
        headers = null;
    }

    download(urlString, headers, function(err, res) {
        if (err)
            callback(err, null);
        else {
            var str = "";
            res.setEncoding("utf8");
            res
                .on("data", function(chunk) { str += chunk; })
                .on("end", function() { callback(null, str); });
        }
    }, redirCb);
}

/**
 * Parses the arguments this process was called with in the form `( --NAME PARAM* )*`
 * @returns {object} object of parsed options
 */
function readopts() {
    if (process.argv.length < 3)
        return null;
    var opts = {};
    var lastOpt = "";
    for (var i = 2; i < process.argv.length; i++) {
        var arg = process.argv[i];
        if (arg.indexOf("--") === 0)
            opts[lastOpt = arg.substr(2)] = "";
        else if (opts[lastOpt])
            opts[lastOpt] += (opts[lastOpt].length > 0 ? " " : "") + arg;
        else
            opts[lastOpt] = arg;
    }
    return opts;
}

/**
 * Executes some command synchronously and returns its standard output
 * @param {string} cmd Command to execute
 */
function exec(cmd) {
    try {
        return child_process.execSync(cmd, { encoding: "utf8" });
    }
    catch (e) {
        console.log("Command \"" + cmd + "\" failed: " + e);
        process.exit(0);
    }
}

module.exports = {
    mkdirSilent: mkdirSilent,
    download: download,
    downloadText: downloadText,
    readopts: readopts,
    exec: exec
}