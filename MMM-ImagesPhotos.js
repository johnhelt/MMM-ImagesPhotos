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

		this.sendSocketNotification("INIT");

		if (this.config.show == "photo") {
			this.sendSocketNotification("SET_CONFIG", this.config);		
			Log.info("sent SET_CONFIG message to node_helper");
		};

		this.getImageFromNodeHelper("/MMM-ImagesPhotos/update");
		Log.info(`got ${this.image.url} from nodehelper at initialization`)
		
	},


	getImageFromNodeHelper: function(urlAppHelper) {

		Log.info("calling node helper get image at initialization");
		// var urlAppHelper = "/MMM-ImagesPhotos/update";
		var self = this;

		var photosRequest = new XMLHttpRequest();
		photosRequest.open("GET", urlAppHelper, true);

		photosRequest.onreadystatechange = function() {
			if (this.readyState === 4) {
				if (this.status === 200) {
					
					self.image = JSON.parse(this.response);
					Log.info(`returned ${self.image.url}`);
					self.updateDom(self.config.animationSpeed);
					
				} else if (this.status === 401) {					
					Log.error(self.name, this.status);
				} else {
					Log.error(self.name, "Could not load photos.");
				}
			}
		};
		photosRequest.send();
		Log.info(`returned outer scope ${self.image.url}`);
		return self.image;

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

	notificationReceived: function(notification, payload, sender) {
		Log.info(`notification received ${notification}`);
		if (notification == "GAMEPAD_BUTTON_PRESSED") {
			Log.info(`payload ${payload.button}`);
			switch (payload.button) {
				case 1:
					window.close();
				case 3:
					Log.info("skip back image");
					this.sendSocketNotification("SHOW_PREVIOUS_IMAGE", {});
					break;
				case 0:
					Log.info("skip forward image");
					this.sendSocketNotification("SHOW_NEXT_IMAGE", {})
					break;
			}
		}

	},

	preload_image: function(im_url) {
		let img = new Image();	  
		img.src = im_url;
		Log.info(`preloaded ${im_url}`);
	},
	  
	

	getDom: function() {
		var self = this;
		var wrapper = document.createElement("div");

		var photoImage = this.image;
		// var current = this.current;
		// const entries = Object.entries(current);
		// Log.info(`entries from socket ${entries}`);

		Log.info(`${this.config.show}: image url ${photoImage.url} and album name: ${photoImage.album}`)
		this.preload_image(photoImage.next_url);

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
