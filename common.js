var http = require("http");
var https = require("https");
var fs = require("fs");
var url = require("url");
var process = require("process");
var path = require("path");
var child_process = require("child_process");

function mkdirSilent(p) {
    var parts = path.normalize(p).split("/");
    var act = "";
    parts.forEach(function (val, i) {
        act += (i > 0 ? "/" : "") + val;
        if (!fs.existsSync(act))
            fs.mkdirSync(act);
    });
}

//headers and redirCb are optional
function download (u, headers, callback, redirCb) {
    var REDIRECT_STATUSES = [301, 302, 303, 307, 308];
    var udata = url.parse(u);
    if (typeof headers === "function") {
        redirCb = callback;
        callback = headers;
        headers = null;
    }
    else
        udata.header = headers;
    var mod = null;
    if (udata.protocol === "http:")
        mod = http;
    else if (udata.protocol === "https:")
        mod = https;
    else
        callback("Invalid protocol", null);
    mod.request(udata, function(res) {
        if (!res)
            callback("Unknown request failure", null);
        if (REDIRECT_STATUSES.indexOf(res.statusCode) >= 0) {
            if (typeof redirCb === "function")
                redirCb(res.statusCode, res.headers.location);
            download(res.headers.location, headers, callback, redirCb);
        }
        else if (res.statusCode != 200)
            callback("HTTP status code: " + res.statusCode, null);
        else
            callback(null, res);
    }).on("error", function(e) { 
        callback(e ? "Request error: " + e : "Unknown request failure");
    }).end();
}

function downloadText(url, headers, callback, redirCb) {
    if (typeof headers === "function") {
        redirCb = callback;
        callback = headers;
        headers = null;
    }
    download(url, headers, function(err, res) {
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

function downloadToFile(url, headers, fn, callback, redirCb) {
    if (typeof fn === "function") {
        redirCb = callback;
        callback = fn;
        fn = headers;
        headers = {};
    }
    download(url, headers, function(err, res) {
        if (err)
            callback(err);
        else {
            try {
                var stream = fn;
                if (typeof fn === "string")
                    stream = fs.createWriteStream(fn);
                res.pipe(fn);
                res.on("end", function() {
                    callback(null);
                });
            }
            catch(e) {
                callback("Stream error: " + e);
            }
        }
    }, redirCb);
}

function waterfall(arr, printFunc) {
    if (arguments.length < 2)
        printFunc = msg=>{ console.log(msg); };
    (function _do(i, async) {
        if (arr.length <= i)
            return;
        if (typeof arr[i] === "string") {
            if (arr[i] === "async")
                _do(i + 1, true);
            else
                console.log(arr[i]);
        }
        else if (async) {
            arr[i]();
            _do(i + 1, false);
        }
        else
            arr[i](_do.bind(i + 1, false));
    })(0, false);
}

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
    downloadToFile: downloadToFile,
    waterfall: waterfall,
    readopts: readopts,
    exec: exec
}