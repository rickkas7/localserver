
// Data samples are stored here
var dataSet = [];



$(document).ready(function() {
	// Run this once after the DOM is loaded
	if (!!window.EventSource) {
		// Good example on using SSE
		// http://www.html5rocks.com/en/tutorials/eventsource/basics/

		var source = new EventSource('data');
		source.addEventListener('message', function(e) {
			// e.data is the SSE data
			//console.log(">>", e);
			// e.lastEventId
			
			// We're passing the full 0-4095 value up to here, but we really
			// only want 0-255 in the graph
            handleData(parseInt(e.data) / 16);
            
		}, false);
	}
	else {
		console.log('sse not supported');
	}
});



function handleData(data) {
	// data is a number value (currently 0 - 255)
	
	var canvas = document.getElementById("canvas");
	var ctx = canvas.getContext("2d");
	
	//console.log(data);
	
	// Add to the data set, remove from the left if it gets wider than the canvas
	dataSet.push(data);
	if (dataSet.length > (canvas.width - 1)) {
		dataSet.shift();
	}
	
	// Erase
	ctx.fillStyle = "#ffffff";
	ctx.fillRect(0, 0, canvas.width, canvas.height);	
	
	// Draw samples
	ctx.fillStyle = "#000000";
	
	for(var ii = 0; ii < dataSet.length; ii++) {
		// The canvas coordinate space increases going down the page, but the graph
		// makes more sense flipped the other way so subtract the value from the 
		// maximum value
		var yy = 255 - dataSet[ii];
		
		ctx.fillRect(ii, yy, 1, 1);
	}
	
	
}


