
// Data samples are stored here
var dataSet = [];

var rowsToKeep = 40;


$(document).ready(function() {
	// Run this once after the DOM is loaded
	if (!!window.EventSource) {
		// Good example on using SSE
		// http://www.html5rocks.com/en/tutorials/eventsource/basics/

		var source = new EventSource('data');
		source.addEventListener('message', function(e) {
			// e.data is the SSE data
			//console.log(">>", e);

			// Split the comma-separated list of values into an array of values
            handleData(e.data.split(","));
            
		}, false);
	}
	else {
		console.log('sse not supported');
	}
});



function handleData(array) {
	
	var rowCount = $('#dataTable > tbody > tr').length;
	if ((rowCount + 1) >= rowsToKeep) {
		// After adding rows, there will be too many, remove last
		$('#dataTable > tbody > tr:last').remove();
	}
	// Prepare a row
	var html = '<tr>';
	for(var ii = 0; ii < array.length; ii++) {
		html += '<td>' + array[ii] + '</td>';
	}	
	html += '</tr>';
	
	// Insert at the beginning
	$(html).prependTo("#dataTable > tbody");
	
	
}


