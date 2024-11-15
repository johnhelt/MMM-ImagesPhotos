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
		
		// Initialize the configuration and database
		this.setConfig();        
		this.initDatabase(); // Initialize the SQLite database for EXIF caching
		
		this.image = {url: null, album: null}; // Initialize the image object
		this.photos = []; // Initialize the photos array
	
		console.log(`Initial image is ${this.image.url}`);
		
		this.initImagesPromise = self.getImagesInit();
		// Setup additional routes for the module

		this.initImagesPromise.then(() => {
			// Only setup routes once images are ready
			console.debug(`initImagesPromise completed. Images are now ${this.photos.length}`);
			this.extraRoutes(self);
		}).catch(err => {
			console.error("Error during image initialization:", err);
		});
			
		// Initialize image fetching
		
	},

	setConfig: function() {
		this.config = {};		
		this.path_images = path.resolve(global.root_path + "/modules/MMM-ImagesPhotos/uploads");
		this.current_album = "";		
		this.configured = false;
	},

	getImagesInit: async function () {
		console.debug("Calling getImagesInit");
		const files = await this.getFilesAndDates(this.path_images, []);
		console.debug("getImagesInit: Files returned...");
		this.photos = this.getImages(files);		
		const index = this.weightedRandomIndex(this.photos);
		this.photos[index].lastSelectionTime = Date.now();
		this.next_index = this.weightedRandomIndex(this.photos);
		this.image = this.publishImageAndFolder(index, this.next_index, this.photos);
		console.debug(`Photos at initialization: ${this.photos.length}`);
	},

	// Initialize the SQLite database
	initDatabase: function() {
		const sqlite3 = require('sqlite3').verbose();  // Ensure you require sqlite3 module
		this.db = new sqlite3.Database(path.join(global.root_path, '/databases/exif_cache.db'), (err) => {
			if (err) {
				console.error('Failed to open SQLite database:', err.message);
			} else {
				console.log('SQLite database connected');
			}
		});

		// Create a table to store EXIF data if it doesn't exist
		this.db.run(`
			CREATE TABLE IF NOT EXISTS exif_data (
				filePath TEXT PRIMARY KEY,
				exifData TEXT
			)`);
	},


	// Retrieve EXIF data from the database
	getExifDataFromDB: function(filePath, callback) {
		this.db.get(`SELECT exifData FROM exif_data WHERE filePath = ?`, [filePath], (err, row) => {
			if (err) {
				console.error('Error retrieving EXIF data from DB:', err.message);
				callback(null); // Callback with null if error occurs
				return;
			}
			
			if (row) {
				console.debug(`EXIF data found for ${filePath}`);
				callback(JSON.parse(row.exifData)); // Parse the stored EXIF data
			} else {
				console.debug(`No EXIF data found for ${filePath}`);
				callback(null); // Callback with null if no data found
			}
		});
	},

	// Save EXIF data to the database
	saveExifDataToDB: function(filePath, exifData, callback) {
		// Check if EXIF data already exists for this file
		this.db.run(`
			INSERT OR REPLACE INTO exif_data (filePath, exifData) 
			VALUES (?, ?)`, [filePath, JSON.stringify(exifData)], (err) => {
			if (err) {
				console.error('Error saving EXIF data to DB:', err.message);
				callback(false); // Callback with false on error
				return;
			}

			console.debug(`EXIF data saved for ${filePath}`);
			callback(true); // Callback with true if saving was successful
		});
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
			console.info("calling publish interval function");
			let index = self.next_index;
		
			// Validate that next_index is within bounds
			let next_index = self.weightedRandomIndex(self.photos, self.config.updateInterval / 1000);
			if (next_index === null || next_index >= self.photos.length) {
				console.error("Invalid next_index: ", next_index);
				return;
			}
		
			const currentTimestamp = Date.now();
			self.photos[next_index].lastSelectionTime = currentTimestamp;
			self.next_index = next_index;
			const image = self.publishImageAndFolder(index, self.next_index, self.photos);
			self.sendSocketNotification("PUBLISHED", image);
		}, self.config.updateInterval);
		
		setInterval(function() {
			var self = t_this;
			console.info("updating images");
		
			// Async function wrapper to handle 'await' correctly
			(async function() {
				console.debug(`Calling async image update. Current photos length ${self.photos.length}. Looking for images on: ${self.path_images}`);
				try {
					const files = await self.getFilesAndDates(self.path_images, self.photos);  // Asynchronous call
					console.debug("Files received, now processing photos");
					self.photos = self.getImages(files);  // Process the files as usual
					console.debug(`Update completed. Number of images: ${self.photos.length}`);
				} catch (error) {
					console.error("Error updating images:", error);
				}
			})();
		
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
		const decayFactor = Math.log(2) / halfLife;
	
		const maxWeight = 1;  // Maximum weight
		const minWeight = 0.1;  // Minimum weight for the oldest photo
	
		// Calculate weights based on decay
		const weights = photos.map(photo => {
			console.debug(`Photo and timestamp: ${photo.filePath} ${this.timestampToUTC(photo.timestamp)}`);
			const ageInSeconds = (currentTimestamp - photo.timestamp) / 1000;
			const weight = Math.max(minWeight, maxWeight * Math.exp(-decayFactor * ageInSeconds));
			return weight;
		});
	
		// Calculate total weight for normalization
		const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
		if (totalWeight === 0) {
			console.error("Total weight is zero, check decay settings.");
			return;
		}
	
		// Normalize weights and store in photos array
		photos.forEach((photo, index) => {
			photo.weight = weights[index] / totalWeight;
		});
	
		console.debug("Calculated normalized weights:", photos.map(photo => photo.weight));
	},

	weightedRandomIndex: function(photos) {
		if (!photos || photos.length === 0) {
			console.debug("No photos available, cannot select a random index.");
			return null;
		}
		if (photos.length === 1) {
			return 0;
		}
	
		const randomValue = Math.random();
		let cumulativeWeight = 0;
		for (let i = 0; i < photos.length; i++) {
			cumulativeWeight += photos[i].weight;
			if (randomValue <= cumulativeWeight) {
				console.debug("Selected index:", i);
				return i;
			}
		}
	
		// Edge case fallback
		console.debug("Cumulative weight issue detected. Returning last photo as fallback.");
		return photos.length - 1;  // Fallback to the last photo if the loop fails
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
	// receive request and send response
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

	ThroughDirectory: async function(files, directory, ignoreList, input_directory) {
		console.log(`Calling ThroughDirectory on ${directory} and ${input_directory}`);
		const filePromises = fs.readdirSync(directory).map(async (file) => {
			const absolutePath = path.join(directory, file);
			const relativePath = path.relative(input_directory, absolutePath);
			const stats = fs.statSync(absolutePath);
	
			if (stats.isDirectory()) {
				if (!ignoreList.includes(relativePath)) {
					await this.ThroughDirectory(files, absolutePath, ignoreList, input_directory);  // Recursive call for directories
				}
			} else {
				// Use the DB to get EXIF data if cached
				await new Promise((resolve) => {
					this.getExifDataFromDB(relativePath, (cachedExifData) => {
						let timestamp;
						if (cachedExifData) {							
							timestamp = cachedExifData.timestamp;  // Use cached EXIF data
							resolve();
						} else {
							try {
								const buffer = fs.readFileSync(absolutePath);
								const parser = ExifParser.create(buffer);
								const result = parser.parse();
								const dateTaken = result.tags.DateTimeOriginal;
	
								if (dateTaken) {
									timestamp = new Date(dateTaken * 1000).getTime();  // Use EXIF data
									console.debug(`EXIF Date Taken for ${relativePath}:`, new Date(timestamp).toUTCString());
								} else {
									timestamp = stats.mtime.getTime();  // Fall back to modified time
									console.debug(`No EXIF Date Taken for ${relativePath}. Using modified time:`, new Date(timestamp).toUTCString());
								}
	
								// Save EXIF data for future use
								this.saveExifDataToDB(relativePath, { timestamp: timestamp }, (success) => {
									if (success) {
										console.debug("EXIF data saved for " + relativePath);
									}
									resolve();  // Resolve when saving is done
								});
							} catch (error) {
								console.error("Error reading EXIF data for", relativePath, ":", error);
								timestamp = stats.mtime.getTime();  // Fallback to file's modified time
								// Save EXIF data for future use
								this.saveExifDataToDB(relativePath, { timestamp: timestamp }, (success) => {
									if (success) {
										console.debug("Fallback timestamp saved for " + relativePath);
									}
									resolve();  // Resolve when saving is done
								});								
							}
						}
	
						// Push file information to the array after processing
						files.push({ filePath: relativePath, timestamp: timestamp, lastSelectionTime: 0 });
						console.debug(`File added (abs): ${absolutePath} - (rel): ${relativePath} with timestamp: ${new Date(timestamp).toUTCString()}`);
					});
				});
			}
		});
	
		// Wait for all the file processing promises to complete
		console.debug("Waiting for filePromises");
		await Promise.all(filePromises);
		console.debug("Done waiting for filePromises");
	},
	
	getFilesAndDates: async function(input_directory, oldfiles) {
		console.debug("Calling getFilesAndDates");
		let files = [];
		let ignoreList = [];
	
		const ignoreFilePath = path.join(input_directory, ".ignore");
		if (fs.existsSync(ignoreFilePath)) {
			const ignoreContent = fs.readFileSync(ignoreFilePath, "utf-8");
			ignoreList = ignoreContent
				.split("\n")               
				.map(line => line.trim())   
				.filter(line => line && !line.startsWith("#"));  
			console.debug("Ignoring directories:", ignoreList);
		}
	
		await this.ThroughDirectory(files, input_directory, ignoreList, input_directory);  // Await the result from ThroughDirectory
		console.debug(`Done iterating over input directory. Found ${files.length} files.`);
		return files;
	}	
});
