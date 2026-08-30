const path = require('path');

function getVideoDuration(filePath) {
  // ffprobe removed - duration is optional, return null
  return null;
}

module.exports = { getVideoDuration };
