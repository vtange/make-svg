// tiles.js
// Kas Thomas, ported to pure JS by Victor Tang
// 23 January 2010 -> 23 March 2017
//
// Public domain.
//

var Jimp = require("jimp");
var fs = require("fs");

var IMAGE, RMSERROR_THRESHOLD, WIDTH_THRESHOLD, HEIGHT_THRESHOLD;

// ------------------ RECURSIVE SUBDIVISION -------------------
function quadRecurse( ar, rect ) {
   
   //associate pixArray with rect
   var pixArray = getPixArrayFromRect( rect );

   if ( !isDivisible( pixArray, rect ) ) {
           ar.push( rect );
           return;
   }
   var newRects = quadDivide( rect ); // partition rect

   for (var i = 0; i < newRects.length; i++)  // size check
   {
        if (newRects[i][2] < 1 || newRects[i][3] < 1) {
                ar.push(rect);
                return;
        }
   }

   for (var i = 0; i < newRects.length; i++) // recurse on each new rect
   {
        quadRecurse( ar, newRects[ i ] );
   }
}

function quadDivide( rect ) {

   var centerx = rect.color[4];
   var centery = rect.color[5];

   var widthToCenterx  = centerx - rect[0];
   var heightToCentery = centery - rect[1];

   var rect1 = [ rect[0], rect[1], widthToCenterx, heightToCentery ]; // UL
   var rect2 = [ rect[0], centery, widthToCenterx, rect[3] - heightToCentery]; // LL
   var rect3 = [ rect[0] + widthToCenterx, rect[1], rect[2] - widthToCenterx, heightToCentery ]; // UR
   var rect4 = [ rect[0] + widthToCenterx, centery, rect[2] - widthToCenterx, rect[3] - heightToCentery ]; // LR

   return [ rect1, rect2, rect3, rect4 ];
}

function getRMSError( pixArray, rect ) {

          var accumulator = 0;
          var diff = 0;
          var smallestDiff = Infinity;
          //might need diff intensity, -> blk white algo-> blue is darker than red
          var intensity = 0;
          var totIntensity = pixArray.reduce(function(curr,nxt){
                return curr + (0.2126*nxt[0] + 0.7152*nxt[1] + 0.0722*nxt[2]);
                },(0.2126*pixArray[0][0] + 0.7152*pixArray[0][1] + 0.0722*pixArray[0][2]));
          var rms = 0;
          var len = pixArray.length;
          var aveIntensity = totIntensity / len;
          rect.color = pixArray[0];

          for (var i = 0; i < len; i++) {
                  //the further away from aveIntensity, the higher the diff
                  //get rect.color by finding smallest diff
                  intensity = (0.2126*pixArray[i][0] + 0.7152*pixArray[i][1] + 0.0722*pixArray[i][2]);
                  diff = Math.pow(intensity - aveIntensity,2);
                  accumulator += diff;
                  if(diff < smallestDiff)
                  {
                          smallestDiff = diff;
                          rect.color = pixArray[i];
                  }
          }

          rms = accumulator/len;
          return Math.sqrt(rms);
  }

// -------------- divisibility ----------------
function isDivisible( pixArray, rect ) {

   var rms = getRMSError( pixArray, rect );

   if (rms - RMSERROR_THRESHOLD < 0 || rect[2] < WIDTH_THRESHOLD || rect[3] < HEIGHT_THRESHOLD)
   {
        //stops dividing
        return false;
   }
   return true;
}

function getPixArrayFromRect( rect ) {
        var arr = [];
        IMAGE.scan(rect[0], rect[1], rect[2], rect[3], function (x, y, idx) {
        // x, y is the position of this pixel on the image
        // idx is the position start position of this rgba tuple in the bitmap Buffer
        // this is the image

        var red   = this.bitmap.data[ idx + 0 ];
        var green = this.bitmap.data[ idx + 1 ];
        var blue  = this.bitmap.data[ idx + 2 ];
        var alpha = this.bitmap.data[ idx + 3 ];

        // rgba values run from 0 - 255
        // e.g. this.bitmap.data[idx] = 0; // removes red from this pixel
        arr.push([red,green,blue,alpha,x,y]);
        });
   return arr;
}

function componentToHex(c) {
    var hex = c.toString(16);
    return hex.length == 1 ? "0" + hex : hex;
}

function rgbToHex( arrColor ) {
    return "#" + componentToHex(arrColor[0]) + componentToHex(arrColor[1]) + componentToHex(arrColor[2]);
}

// -------------------- WRITE SVG ----------------------
function writeSVG( ar , width, height, destfile ) {
   var pixels = null;
   var color = null;
   var output =
   '<?xml version="1.0" encoding="UTF-8" standalone="no"?>'+
   '\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 20010904//EN" ' +
   '"http://www.w3.org/TR/2001/REC-SVG-20010904/DTD/svg10.dtd">' +
   '<svg xmlns="http://www.w3.org/2000/svg" ' +
   'xmlns:xlink="http://www.w3.org/1999/xlink" ' +
   'viewBox="0 0 '+width+' '+height+'" ' +
   'xml:space="preserve" ' +
   'width="'+width+'" '+
   'height="'+height+'">';
   output += "<g transform=\"scale(1)\">";
   if (!destfile) destfile = 'output.svg';

   for (var i = 0; i < ar.length; i++) {
           output += outputSVGRect( ar[i], rgbToHex(ar[i].color) );
   }
   output += "</g>";
   output += "\n</svg>";
   // write output to file
   fs.writeFile('public/output.svg', output, function(err){
        if(err) {
            console.log("Failed to write SVG", err);
            return;
        }
        console.log('File successfully written! - Check your project directory for the output.json file');
   });
}

function outputSVGRect( rect, color ) {

   var str = "<rect x=";
   str += "\"" + rect[0] + "\" ";
   str += "y=\"" + rect[1] + "\" ";
   str += "width=\"" + rect[2] + "\" ";
   str += "height=\"" + rect[3] + "\" ";
   str += "fill=\"" + color + "\" ";
   str += "stroke=\"" + color + "\" ";
   str += "/>\r";

   return str;
}

// ---------- Main work routine ------------
// Usage:
//
//   doQuadding( 10, 6, "svg", "C:/test1.svg" );
//   (writes output to an SVG file)
//

function doQuadding( image, rms, sizeLowLimit ) {
   if (!image) {
           console.log("Nothing to do; no source image." );
           return;
   }
   var w = image.bitmap.width, h = image.bitmap.height;
   var mainRect = [ 0,0,w,h ];
   var mainArray = new Array();

   IMAGE = image;
   RMSERROR_THRESHOLD = rms;
   WIDTH_THRESHOLD = HEIGHT_THRESHOLD = sizeLowLimit;

   quadRecurse( mainArray, mainRect );  // *** RECURSE ***

   console.log("Total rects: " + mainArray.length );

   writeSVG( mainArray, w, h );
}

//config -> show rects
OUTLINES = false;

//start time
var start = 1 * new Date;


Jimp.read(process.argv[2], function(err, image) {
        //  Actually call the entry point (begin processing):
        doQuadding( image, 8,6 );

        var end = 1 * new Date;
        console.log("Finished in " + (end-start) +
        " milliseconds");
});



