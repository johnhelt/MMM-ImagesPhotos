/* global Module */

/* Magic Mirror
 * Module: MMM-ImagesPhotos
 *
 * By Rodrigo Ramírez Norambuena https://rodrigoramirez.com
 * MIT Licensed.
 */

Module.register("MMM-ImagesPhotos",{
	defaults: {
		opacity: 0.9,
		animationSpeed: 500,
		updateInterval: 5000,
		getInterval: 60000,
		maxWidth: "100%",
		maxHeight: "100%",
		retryDelay: 2500,
		show: "photo",		
	},

	requiresVersion: "2.1.0", // Required version of MagicMirror

	start: function() {
		var self = this;
		this.image = {};
		this.current = {url: "", album: ""};
		this.loaded = false;
		this.lastPhotoIndex = -1;

		// Should start photo updater only if configured

		
		this.sendSocketNotification("STARTUP", this.config);		

		Log.info("sent STARTUP message to node_helper");

		this.callNodeHelper("/MMM-ImagesPhotos/initialize", true);

		if (this.config.show == "photo") {						
			setInterval(function() {
				Log.info("ask for update")
				self.callNodeHelper("/MMM-ImagesPhotos/update", false);
			}, this.config.updateInterval);

		}		
		
	},



	callNodeHelper: function(urlAppHelper, init) {

		// var urlAppHelper = "/MMM-ImagesPhotos/update";
		var self = this;

		var photosRequest = new XMLHttpRequest();
		photosRequest.open("GET", urlAppHelper, true);

		photosRequest.onreadystatechange = function() {
			if (this.readyState === 4) {
				if (this.status === 200) {
					
					if (init) {
						self.image = JSON.parse(this.response);	
						self.updateDom(self.config.animationSpeed);		
					}
					
				} else if (this.status === 401) {					
					Log.error(self.name, this.status);
				} else {
					Log.error(self.name, "Could not load photos.");
				}
			}
		};
		photosRequest.send();

	},

	// Listen to server notifications on websocket

	socketNotificationReceived: function(notification, payload) {
		var self = this;
		Log.info(this.config.show + "-" + this.name + " received a socket notification: " + notification + " - Payload: " + payload);
		if (notification == "PUBLISHED") {
			self.image = payload;
			self.updateDom(self.config.animationSpeed);			
		}
		
	},
	

	getDom: function() {
		var self = this;
		var wrapper = document.createElement("div");

		var photoImage = this.image;
		// var current = this.current;
		// const entries = Object.entries(current);
		// Log.info(`entries from socket ${entries}`);

		Log.info(`${this.config.show}: image url ${photoImage.url} and album name: ${photoImage.album}`)

		if (photoImage && this.config.show == "photo") {
			var img = document.createElement("img");
			img.src = photoImage.url;
			img.id = "mmm-images-photos";
			img.style.maxWidth = this.config.maxWidth;
			img.style.maxHeight = this.config.maxHeight;
			img.style.opacity = self.config.opacity;
                        img.style.position = "sticky";
			wrapper.appendChild(img);
		}
		else if (photoImage && this.config.show == "album") {
			var textdiv = document.createElement("div")
			textdiv.classList.add("album")
			textdiv.innerHTML = photoImage.album;			
			wrapper.appendChild(textdiv);

		}
		return wrapper;
	},

	getStyles: function() {
		return ["MMM-ImagesPhotos.css"]
	},	

});
