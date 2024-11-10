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
const ExifParser = require("exif-parser");

const LOG_LEVELS = {
	DEBUG: 0,
	INFO: 1,
	WARN: 2,
	ERROR: 3,
  };
  
const currentLogLevel = LOG_LEVELS.DEBUG; // Set your desired log level

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
		this.photos = [];
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
		this.photos = this.getImages(this.getFilesAndDates(this.path_images, []));		
		const index = this.weightedRandomIndex(this.photos);
		this.photos[index].lastSelectionTime = Date.now();
		this.next_index = this.weightedRandomIndex(this.photos);
		this.image = this.publishImageAndFolder(index, this.next_index, this.photos);
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

	timestampToUTC: function(timestamp) {
		const date = new Date(timestamp); // Create a Date object from the timestamp
		return date.toUTCString(); // Convert to UTC string
	},

	calculateWeights: function(photos) {
		const currentTimestamp = Date.now();
		const halfLife = this.config.halfLife || 2 * 365 * 24 * 3600; // Default half-life (in seconds)
		const decayFactor = Math.log(2) / halfLife; // Calculate decay factor
	
		const maxWeight = 1; // Maximum weight for the most recent photo
		const minWeight = 0.1; // Minimum weight for the oldest photo
	
		const weights = photos.map(photo => {			
			console.debug(`Photo and timestamp: ${photo.filePath} ${this.timestampToUTC(photo.timestamp)}`);
			const ageInSeconds = (currentTimestamp - photo.timestamp) / 1000; // Calculate age based on timestamp
			const weight = Math.max(minWeight, maxWeight * Math.exp(-decayFactor * ageInSeconds)); // Apply decay
			return weight;
		});
	
		const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
		// Normalize weights
		const normalizedWeights = weights.map(weight => weight / totalWeight);
	
		// Store the calculated weights for later use
		photos.forEach((photo, index) => {
			photo.weight = normalizedWeights[index]; // Store the normalized weight in the photo object
		});
	
		console.debug("Calculated Weights:", normalizedWeights);
	},

	weightedRandomIndex: function(photos) {
		if (photos.length === 1) {
			return 0; // Only one photo, so no need for weighting.
		}
	
		// Select a random index based on weighted probabilities
		const randomValue = Math.random();
		let cumulativeWeight = 0;
		for (let i = 0; i < photos.length; i++) {
			cumulativeWeight += photos[i].weight;
			if (randomValue <= cumulativeWeight) {
				console.debug("Selected index:", i);
				console.debug("Selected photo:", photos[i].filePath);
				console.debug("cumulativeWeight", cumulativeWeight);
				console.debug("randomValue", randomValue);
				return i;
			}
		}
	
		console.debug("No photo selected due to cumulative weight issue. Returning first photo.");
		return 0; // Fallback to the first photo if something goes wrong.
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
		const enabledTypes = ["image/jpeg", "image/png", "image/gif"];
		
		// Filter files for images only
		const images = files.filter(file => {
			const type = mime.lookup(file.filePath);
			return enabledTypes.includes(type);
		});

	
		// Check if the photos list has changed by comparing the lengths or file paths
		const hasUpdated = images.length !== this.photos.length ||
			images.some((img, index) => img.filePath !== this.photos[index]?.filePath);
	
		// Update photos list if there are changes
		if (hasUpdated) {
			this.photos = images;
			this.calculateWeights(this.photos); // Recalculate weights only if there was an actual update
			console.debug("Images updated, recalculated weights.");
		} else {
			console.debug("No update in images, skipping weight recalculation.");
		}
	
		return this.photos;
	},
	

	getFilesAndDates: function(input_directory, oldfiles) {
		let files = [];
		let ignoreList = [];
	
		// Check if .ignore file exists and read it if present
		const ignoreFilePath = path.join(input_directory, ".ignore");
		if (fs.existsSync(ignoreFilePath)) {
			const ignoreContent = fs.readFileSync(ignoreFilePath, "utf-8");
			ignoreList = ignoreContent
				.split("\n")               // Split lines
				.map(line => line.trim())   // Remove extra spaces
				.filter(line => line && !line.startsWith("#"));  // Remove empty lines and comments
			console.debug("Ignoring directories:", ignoreList);
		}
	
		// Helper function to recursively walk through directories and gather files
		function ThroughDirectory(directory) {
			fs.readdirSync(directory).forEach(file => {
				const absolutePath = path.join(directory, file);
				const relativePath = path.relative(input_directory, absolutePath);
				const stats = fs.statSync(absolutePath);
	
				// Skip directories listed in the ignore list
				if (stats.isDirectory()) {
					if (!ignoreList.includes(relativePath)) {
						ThroughDirectory(absolutePath); // Recursively check subdirectories
					}
				} else {
					// Check for EXIF "Date Taken" metadata
					let timestamp;
					try {
						const buffer = fs.readFileSync(absolutePath);
						const parser = ExifParser.create(buffer);
						const result = parser.parse();
						const dateTaken = result.tags.DateTimeOriginal;
						
						if (dateTaken) {
							// Use EXIF "Date Taken" if available
							timestamp = new Date(dateTaken * 1000).getTime(); // Convert to milliseconds
							console.debug(`EXIF Date Taken for ${relativePath}:`, new Date(timestamp).toUTCString());
						} else {
							// Use modified time if EXIF data is not available
							timestamp = stats.mtime.getTime();
							console.debug(`No EXIF Date Taken for ${relativePath}. Using modified time:`, new Date(timestamp).toUTCString());
						}
					} catch (error) {
						console.error("Error reading EXIF data for", relativePath, ":", error);
						timestamp = stats.mtime.getTime(); // Fall back to modified time on error
					}
	
					files.push({ filePath: relativePath, timestamp: timestamp, lastSelectionTime: 0 });
					console.debug(`File added: ${relativePath} with timestamp: ${new Date(timestamp).toUTCString()}`);
				}
			});
		}
	
		// Run the directory traversal
		ThroughDirectory(input_directory);
		console.debug(`Done iterating over input directory. Found ${files.length} files.`);
	
		// Combine current and previous file lists, avoiding duplicates
		const keyProperty = "filePath";
		const concatenatedList = Array.from(
			new Set([...files, ...oldfiles].map(item => item[keyProperty]))
		).map(filePath => {
			const itemFromFiles = files.find(item => item[keyProperty] === filePath);
			const itemFromOldFiles = oldfiles.find(item => item[keyProperty] === filePath);
			
			return itemFromFiles || itemFromOldFiles;
		});
	
		return concatenatedList;
	}
});
