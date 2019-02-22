var common = require("./common.js");
var process = require("process");
var fs = require("fs");
var child_process = require("child_process");
var os = require("os");
var path = require("path");

var opts = common.readopts();
if (!opts || "help" in opts) {
    console.log("usage youtube-dl-album URL [options...]");
    console.log("general:");
    console.log("  --youtube-dl CMD - Alternative command for youtube-dl");
    console.log("  --ffmpeg CMD - Alternative command for ffmpeg");
    console.log("  --out OUTDIR - Defaults to .");
    console.log("  --yes - No album track list confirmation");
    console.log("  --keep DOWNPATH - Keep the downloaded file");
    console.log("  --use VID - do not download video again");
    console.log("  --descr DESCR_FILE - use the text in given file instead of video description");
    console.log("ID3 tags:");
    console.log("  --artist ARTIST");
    console.log("  --album ALBUM");
    console.log("  --genre GENRE");
    process.exit(-1);
}

if (!opts[""]) {
    console.log("No url given");
    process.exit(-1);
}

var url = opts[""];
var youtubedl = opts["youtube-dl"] || "youtube-dl";
var ffmpeg = opts["ffmpeg"] || "ffmpeg";
var out = opts["out"] || ".";
var vidPath = opts["keep"] || path.join(os.tmpdir(), "ytdlal");
var removeVid = !("keep" in opts) && !("use" in opts);

if (out.charAt(out.length - 1) !== "/")
    out += "/";
if (youtubedl.charAt(0) !== "\"")
    youtubedl = "\"" + youtubedl + "\"";
if (ffmpeg.charAt(0) !== "\"")
    ffmpeg = "\"" + ffmpeg + "\"";
common.mkdirSilent(out);

var tracks = []; //{ name: , start: };

var exec = common.exec;

function audiopos(s) {
    var parts = s.split(":");
    var result = 0;
    for (var i=0; i<parts.length; i++)
        result = result * 60 + parseInt(parts[i]);
    return result;
}

function download() {
    var formats = exec(youtubedl + " -F \"" + url + "\"");
    var formatName = "best video";
    var formatId = "best";
    var formatExt = "mp4"; //actually just a guess
    if (formats.indexOf("140          m4a") >= 0)
        formatName = "132k audio", formatId = "140", formatExt = "m4a";
    vidPath += "." + formatExt;
    
    if ("use" in opts && fs.existsSync(opts.use)) {
        vidPath = opts.use;
        console.log("Reuse file \"" + opts.use);
    }
    else {
        console.log("Start download of " + formatName);
        exec(youtubedl + " -f " + formatId + " -o \"" + vidPath + "\" \"" + url + "\"");
    }
    
    var cmdline = ffmpeg + " -loglevel panic -y -i \"" + vidPath + "\" -acodec libmp3lame -ab 128k ";
    cmdline += "-id3v2_version 3 ";
    if ("artist" in opts)
        cmdline += "-metadata artist=\"" + opts.artist + "\" ";
    if ("album" in opts)
        cmdline += "-metadata album=\"" + opts.album + "\" ";
    if ("genre" in opts)
        cmdline += "-metadata genre=\"" + opts.genre + "\" ";
    tracks.forEach(function(value, i) {
        console.log("Cut \"" + value.name + "\"");
        var c = cmdline +
            " -metadata track=\"" + (i+1) + "\"" +
            " -ss " + audiopos(value.start);
        if (i+1 < tracks.length)
            c += " -to " + audiopos(tracks[i+1].start);
        c += " \"" + path.join(out, value.name + ".mp3") + "\"";
        exec(c);
    })
    
    if (removeVid)
        fs.unlinkSync(vidPath);
}


function doeverything(descr) {
    /*var TRACK_INFO = /^(\d+[\.\)]\s*)?(.+?)[\s:-]+(\d?\d(:\d\d){1,2})/mg;
    var results;
    while ((results = TRACK_INFO.exec(descr)) !== null) {
        if (results[2] && results[3])
            tracks.push({ name: results[2], start: results[3]});
    }*/
    var TRACK_INFO = /^(\d?\d(:\d\d){1,2})\s+(.+)/mg;
    var results;
    while ((results = TRACK_INFO.exec(descr)) !== null) {
        if (results[1] && results[3])
            tracks.push({ name: results[3], start: results[1]});
    }
    if (tracks.length == 0) {
        console.log("Could not found track list");
        return;
    }
    
    console.log("Found this track list: ");
    tracks.forEach(function (track, i) {
        console.log("\"" + track.name + "\" from " + track.start
            + " to " + (i + 1 === tracks.length ? "END" : tracks[i + 1].start));
    });
    
    if ("yes" in opts)
        download();
    else {
        console.log("Confirm by typing \"yes\": ");
        process.stdin.on("data", function(text) {
            process.stdin.pause();
            if (text.length > 0 && text.charAt(0) == "y")
                download();
            else {
                console.log("canceling");
                process.exit(0);
            }
        });
        process.stdin.setEncoding("utf8");
        process.stdin.resume();
    }
}

if ("descr" in opts) {
    var descr;
    try {
        descr = fs.readFileSync(opts.descr, "utf8");
    }
    catch(e) {
        console.log("Error reading description file: " + e);
        process.exit(0);
    }
    doeverything(descr);
}
else {
    common.downloadText(url, function (err, text) {
        if (err) {
            console.log("HTTP error: ", err);
            return;
        }
        var DESCR_MARKER = "<div id=\"watch-description-text\" class=\"\"><p id=\"eow-description\" class=\"\" >";
        var i = text.indexOf(DESCR_MARKER) + DESCR_MARKER.length,
            j = text.indexOf("</p>", i),
            descr = text.slice(i, j);
        if (i < 0 || j < 0 || descr.length <= 0) {
            console.log("Could not found video description");
            return;
        }
        descr = decodeURIComponent(descr.replace(/<\/?a.*?>/g, "").replace(/<br \/>/g, "\n"));
        doeverything(descr);
    });
}
