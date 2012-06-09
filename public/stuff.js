function getAsBlob(fileurl, callback) {
	var xhr = new XMLHttpRequest();
	xhr.open("GET", fileurl, true);
	xhr.responseType = "blob";
	xhr.onreadystatechange = function() {
		if (xhr.readyState == 4) {
			callback(xhr.response);
		}
	}
	xhr.send();
}
