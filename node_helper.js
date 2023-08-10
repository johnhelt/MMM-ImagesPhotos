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


module.exports = NodeHelper.create({		
	
	// Override start method.
	start: function() {
		var self = this;				
		console.log("Starting node helper for: " + this.name);		
		this.setConfig();
		this.photos = this.getImages(this.getFiles(this.path_images));
		this.test = "";
		this.initial_index = this.randomIndex(this.photos);
		this.extraRoutes();		
		

	},

	setConfig: function() {
		this.config = {};		
		this.path_images = path.resolve(global.root_path + "/modules/MMM-ImagesPhotos/uploads");
		this.image = {};
		this.current_album = "";		
		this.configured = false;
	},

	publishImageAndFolder: function(index, photos) {
		var self = this;

		console.debug(`input photos: ${photos}`)
				
		var photo = photos[index];
		var album_ = path.dirname(photo);
		

		return {url: "/MMM-ImagesPhotos/photo/" + photo, album: album_}

	},

	// Override socketNotificationReceived method.
	socketNotificationReceived: function(notification, payload) {
		var self = this;
		console.log(`received notifiction ${notification} with payload ${payload}`);	
		if (notification == "STARTUP") {
			
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
	extraRoutes: function() {
		var self = this;
		
		this.expressApp.get('/MMM-ImagesPhotos/update', function(req, res) {
			console.log("request for update via GET");
			index = self.randomIndex(self.photos);
			var image = self.publishImageAndFolder(index, self.photos);
			this.image = image;
			self.sendSocketNotification("PUBLISHED", image);
			console.log(`published ${image.url}`)
			res.send(image);
		});

		this.expressApp.get('/MMM-ImagesPhotos/initialize', function(req, res) {
			console.log("initialization request via GET");
			var image = self.publishImageAndFolder(self.initial_index, self.photos);
			this.image = image;
			console.log(`published initial ${image.url}`)
			//res.send({url: "", album: ""});
			res.send(image);


		});
		
		this.expressApp.use("/MMM-ImagesPhotos/photo", express.static(self.path_images));
	},

	
	// return array with only images
	getImages: function(files) {
                console.log(`calling getImages on ${files}`);
		var images = [];
		var enabledTypes = ["image/jpeg", "image/png", "image/gif"];
		for (idx in files) {
			type = mime.lookup(files[idx]);
			if (enabledTypes.indexOf(type) >= 0 && type !== false) {
				images.push(files[idx]);
			}
		}

		return images;
	},

	getFiles: function(input_directory) {
		//console.log('helper input directory: ${input_directory}');
                console.log(`hello world: ${input_directory}`);
		let files = [];
		function ThroughDirectory(Directory) {
                   fs.readdirSync(Directory).forEach(File => {
                     const Absolute = path.join(Directory, File);
                     const Relative = path.relative(input_directory, Absolute);
                     console.log(`file: ${Relative}`);
                     if (fs.statSync(Absolute).isDirectory()) return ThroughDirectory(Absolute);
                     else return files.push(Relative);
                  });
                }
                ThroughDirectory(input_directory);
                console.log(`done iterating over input directory. Found ${files}`);
		return files;
        },
});
