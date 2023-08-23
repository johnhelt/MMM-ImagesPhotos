/* Magic Mirror
 * Node Helper: MMM-ImagesPhotos
 *
 * By Rodrigo Ramìrez Norambuena https://rodrigoramirez.com
 * MIT Licensed.
 */

var express = require("express");
var NodeHelper = require("node_helper");
var request = require("request");
var url = require("url");
var path = require("path");
var fs = require("fs");
var mime = require("mime-types");

const LOG_LEVELS = {
	DEBUG: 0,
	INFO: 1,
	WARN: 2,
	ERROR: 3,
  };
  
const currentLogLevel = LOG_LEVELS.INFO; // Set your desired log level

const originalConsoleInfo = console.info;
const originalConsoleDebug = console.debug;

console.info = function (...args) {
  if (LOG_LEVELS.INFO >= currentLogLevel) {
    originalConsoleInfo.apply(console, args);
  }
};

console.debug = function (...args) {
  if (LOG_LEVELS.DEBUG >= currentLogLevel) {
    originalConsoleDebug.apply(console, args);
  }
};


module.exports = NodeHelper.create({		
	
	// Override start method.
	start: function() {
		var self = this;				
		console.log("Starting node helper for: " + this.name);		
		this.setConfig();		
		this.image = {url: null, album: null}
		console.log(`initial image is ${this.image.url}`);
		this.extraRoutes(this);			
		this.initImagesPromise = self.getImagesInit()
	},

	setConfig: function() {
		this.config = {};		
		this.path_images = path.resolve(global.root_path + "/modules/MMM-ImagesPhotos/uploads");
		this.current_album = "";		
		this.configured = false;
	},

	getImagesInit: async function () {
		var self = this;
		self.photos = self.getImages(self.getFilesAndDates(self.path_images, []));
		index = self.weightedRandomIndex(self.photos, -1);
		self.photos[index].lastSelectionTime = Date.now();
		self.next_index = self.weightedRandomIndex(self.photos, -1);
		self.image = self.publishImageAndFolder(index, self.next_index, self.photos);

	},

	onClientConnect: function(t_this) {
		var self = t_this;
		console.log("entering onClientConnect")

		self.initImagesPromise.then(() => {
			console.log("images received");
		})
		.catch(err => {
			console.error("error fetching images:", err);
		})
		

		setInterval(function() {
			var self = t_this;
			console.info("calling publish interval function")
			index = self.next_index;
			next_index = self.weightedRandomIndex(self.photos, self.config.updateInterval / 1000);
			currentTimestamp = Date.now();
			self.photos[next_index].lastSelectionTime = currentTimestamp;
			self.next_index = next_index;
			var image = self.publishImageAndFolder(index, self.next_index, self.photos);
			self.sendSocketNotification("PUBLISHED", image);

		}, self.config.updateInterval);
		
		setInterval(function() {
			var self = t_this;
			console.info("updating images")
			self.photos = self.getImages(self.getFilesAndDates(self.path_images, self.photos));

		}, self.config.getInterval);
	},

	publishImageAndFolder: function(index, next_index, photos) {
		var self = this;

		

		console.debug("publishing image")
		
		for (const obj of photos) {		
			console.debug("Photos:");	
			for (const key in obj) {
			  if (obj.hasOwnProperty(key)) {
				console.debug(`  Key: ${key}, Value: ${obj[key]}`);
			  }
			}
		}

		var photo = photos[index].filePath;
		var album_ = path.dirname(photo);
		var next_photo = photos[next_index].filePath;
		

		console.info(`publishing photo: ${photo} and next photo: ${next_photo}`);
		

		return {url: "/MMM-ImagesPhotos/photo/" + photo, album: album_, next_url: "/MMM-ImagesPhotos/photo/" + next_photo}

	},

	// Override socketNotificationReceived method.
	socketNotificationReceived: function(notification, payload) {
		var self = this;
		console.log(`received notifiction ${notification} with payload ${payload}`);
		switch (notification) {
			case "SET_CONFIG":
				if (this.configured) break;
				self.config = payload;
				self.onClientConnect(self);
				this.configured = true;
				break;
		}

	},

	weightedRandomIndex: function(photos, updateInterval) {
		var self = this;
		if (photos.length === 1) {
			return 0;
		}

		console.debug("update interval", updateInterval);

		const currentTimestamp = Date.now();
		const maxTimestamp = Math.max(...photos.map(photo => photo.timestamp));
		const weights = photos.map(photo => {
			const timeSinceLastSelection = (currentTimestamp - photo.lastSelectionTime) / 1000;
			console.debug(`time since photo ${photo.filePath} last selected ${timeSinceLastSelection}`);
			return (timeSinceLastSelection >= updateInterval) ? (1 + (maxTimestamp - photo.timestamp) / (currentTimestamp - photo.timestamp)) : 0;
		});

		console.debug("weights: ", weights);

		const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

		let selectedPhotoIndex = -1;
		const randomValue = Math.random() * totalWeight;
		let cumulativeWeight = 0;
		for (let i = 0; i < photos.length; i++) {
			cumulativeWeight += weights[i];
			if (randomValue <= cumulativeWeight) {
				selectedPhotoIndex = i;
				break;
			}
		}

		// If a file was selected, log its name
		if (selectedPhotoIndex !== -1) {			
			console.debug("Selected index:", selectedPhotoIndex);
			console.debug("Selected photo:", photos[selectedPhotoIndex].filePath);			
			
			return selectedPhotoIndex;
		} else {
			console.debug("No photo selected.");
			return 0;
		}

	},

    randomIndex: function(photos) {
		var self = this;

		if (photos.length === 1) {
			return 0;
		}

		var generate = function() {
			return Math.floor(Math.random() * photos.length);
		};

		var photoIndex = generate();			

		return photoIndex;
	},


	// create routes for module manager.
	// recive request and send response
	extraRoutes: function(t_this) {		
		var self = t_this;

		image = t_this.image;
		
		console.info(`extraRoutes image ${image.url}`)
		
		this.expressApp.get('/MMM-ImagesPhotos/update', function(req, res) {			
			var self = this;
			var image = t_this.image;
			console.info("request for update via GET");			
			
			console.info(`published ${image.url}`)
			res.send(image);
		});

		this.expressApp.use("/MMM-ImagesPhotos/photo", express.static(self.path_images));
	},

	
	// return array with only images
	getImages: function(files) {
                console.debug(`calling getImages on ${files}`);
		var images = [];
		var enabledTypes = ["image/jpeg", "image/png", "image/gif"];
		files.forEach(file => {
			type = mime.lookup(file.filePath);
			if (enabledTypes.indexOf(type) >= 0 && type !== false) {
				images.push(file);
			}
		});

		return images;
	},
	

	getFilesAndDates: function(input_directory, oldfiles) {
		let files = [];
		console.debug("updating files");
		function ThroughDirectory(Directory) {
                   fs.readdirSync(Directory).forEach(File => {
                     const Absolute = path.join(Directory, File);
                     const Relative = path.relative(input_directory, Absolute);
					 const stats = fs.statSync(Absolute);
                     console.debug(`file: ${Relative}`);
                     if (fs.statSync(Absolute).isDirectory()) return ThroughDirectory(Absolute);
                     else return files.push({filePath: Relative, timestamp: stats.mtime.getTime(), lastSelectionTime: 0});
                  });
                }

		ThroughDirectory(input_directory);
		console.debug(`done iterating over input directory. Found ${files.length}`);
		
		const keyProperty = 'filePath';

		// Update using last known list (in case new photos were added). Ensure no duplicates.

		const concatenatedList = Array.from(
			new Set([...files, ...oldfiles].map(item => item[keyProperty]))
		).map(filePath => {
			const itemFromFiles = files.find(item => item[keyProperty] === filePath);
			const itemFromOldFiles = oldfiles.find(item => item[keyProperty] === filePath);

			if (!itemFromFiles && !itemFromOldFiles) {
				return null;
			}

			if (!itemFromFiles) {
				return itemFromOldFiles;
			}

			if (!itemFromOldFiles) {
				return itemFromFiles;
			}
			
			if (itemFromFiles.lastSelectionTime >= itemFromOldFiles.lastSelectionTime) {
				return itemFromFiles;
			} else {
				return itemFromOldFiles
			}

		});

		return concatenatedList;
        },
});
