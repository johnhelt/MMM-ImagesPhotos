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
		this.delay = false;
	},

	getImagesInit: async function () {
		var self = this;
		self.photos = self.getImages(self.getFiles(self.path_images));
		index = self.randomIndex(self.photos);
		self.next_index = self.randomIndex(self.photos);
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
			if (self.delay) {
				self.delay = false;
				return;
			}
			index = self.next_index			
			self.next_index = self.randomIndex(self.photos);			
			var image = self.publishImageAndFolder(index, self.next_index, self.photos);
			self.sendSocketNotification("PUBLISHED", image);

		}, self.config.updateInterval);
		
		setInterval(function() {
			var self = t_this;
			self.photos = self.getImages(self.getFiles(self.path_images));

		}, self.config.getInterval);
	},

	publishImageAndFolder: function(index, next_index, photos) {
		var self = this;

		console.debug(`input photos: ${photos}`);
				
		var photo = photos[index];
		var album_ = path.dirname(photo);
		var next_photo = photos[next_index]

		console.log(`publishing photo: ${photo} and next photo: ${next_photo}`);
		

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
		
		console.log(`extraRoutes image ${image.url}`)
		
		this.expressApp.get('/MMM-ImagesPhotos/update', function(req, res) {			
			var self = this;
			var image = t_this.image;
			console.log("request for update via GET");			
			
			console.log(`published ${image.url}`)
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
		let files = [];
		function ThroughDirectory(Directory) {
                   fs.readdirSync(Directory).forEach(File => {
                     const Absolute = path.join(Directory, File);
                     const Relative = path.relative(input_directory, Absolute);
                     console.debug(`file: ${Relative}`);
                     if (fs.statSync(Absolute).isDirectory()) return ThroughDirectory(Absolute);
                     else return files.push(Relative);
                  });
                }
                ThroughDirectory(input_directory);
                console.log(`done iterating over input directory. Found ${files}`);
		return files;
        },
});
