I18n.translations = {
	en: {
		onTumblr: 'view on Tumblr',
		nsfw: 'NSFW',
		previousPage: 'previous',
		nextPage: 'next',
		currentPage: 'page {{page}} of {{numPages}}',
		asked: 'asked',
		noteCount: {
			one: '{{count}} note',
			other: '{{count}} notes',
			thousands: '{{count.thousands}}K notes',
			millions: '{{count.millions}}M notes',
			billions: '{{count.billions}}B notes'
		},
		rebloggedFrom: 'reblogged from',
		source: 'source',
		reblog: 'reblog',
		follow: 'follow',
		postType: {
			one: '{{type}} post',
			other: '{{type}} posts'
		},
		tag: '#{{tag}}',
		postIdTitle: '{{type}} {{id}}'
	}
};

I18n.pluralize = function (pluralize) {
	return function (count, scope, options) {
		options['count.tens']      = count / 1e1 | 0;
		options['count.hundreds']  = count / 1e2 | 0;
		options['count.thousands'] = count / 1e3 | 0;
		options['count.millions']  = count / 1e6 | 0;
		options['count.billions']  = count / 1e9 | 0;
		options['count.trillions'] = count / 1e12 | 0;
		return pluralize.call(this, count, scope, options);
	};
}(I18n.pluralize);

I18n.pluralizationRules.en = function (n) {
	return n == 0  ? [ 'zero', 'none', 'other' ]
		: n == 1   ? [ 'one', 'digit', 'other' ]
		: n < 1e1  ? [ 'digit', 'other' ]
		: n < 1e2  ? [ 'tens', 'other' ]
		: n < 1e3  ? [ 'hundreds', 'other' ]
		: n < 1e6  ? [ 'thousands', 'other' ]
		: n < 1e9  ? [ 'millions', 'other' ]
		: n < 1e12 ? [ 'billions', 'other' ]
		: n < 1e15 ? [ 'trillions', 'other' ]
		: 'other';
};

App = Ember.Application.create({
	APIKey: Ember.get(document.location.search.match(/[?&]api[-_]?key=([^=&]*)/i), 'lastObject')
		|| 'XR1x0c5pzhJBZ3yI31GRA0Q3mroKM7g8lP80DZ0EgTmOBmWLdm',
	host: Ember.get(document.location.search.match(/[?&]host=([^=&]*)/i), 'lastObject')
		|| 'staff.tumblr.com',
	cachePages: [ '0', 'false' ].indexOf(Ember.get(document.location.search.match(/[?&]cache[-_]?pages=([^=&]+)/i), 'lastObject')) === -1,
	
	// Remove these if using ember.min.js (or ember.prod.js), i.e. if using a production environment
	LOG_TRANSITIONS: true,
	LOG_BINDINGS: true,
	LOG_VIEW_LOOKUPS: true,
	LOG_STACKTRACE_ON_DEPRECATION: true,
	LOG_VERSION: true,
	debugMode: true
});

!function () {
	document.title = App.host;
	
	console.log('Tumblr API Key: ' + App.APIKey);
	console.log('Tumblr blog: ' + App.host);
}();

// http://stackoverflow.com/a/13884238
App.ArrayTransform = DS.Transform.extend({
	/* If the outgoing json is already a valid javascript array
	   then pass it through untouched. In all other cases, replace it
	   with an empty array.  This means null or undefined values
	   automatically become empty arrays when serializing this type. */
	
	serialize: function serialize(deserialized) {
		if (Ember.typeOf(deserialized) === 'array')
			return deserialized;
		
		if (deserialized !== undefined && deserialized !== null)
			return [ deserialized ];
		
		return [ ];
	},
	
	/* If the incoming data is a javascript array, pass it through.
	   If it is a string, then coerce it into an array by splitting
	   it on commas and trimming whitespace on each element.
	   Otherwise pass back an empty array.  This has the effect of
	   turning all other data types (including nulls and undefined
	   values) into empty arrays. */
	
	deserialize: function deserialize(serialized) {
		switch (Ember.typeOf(serialized)) {
			case 'array':
				return serialized;
			case 'string':
				return serialized.split(',').map(jQuery.trim);
			default:
				return [ ];
		}
	}
});

App.ApplicationSerializer = DS.RESTSerializer.extend({
	keyForAttribute: function keyForAttribute(attr) {
		return attr.underscore();
	},
	
	typeForRoot: function typeForRoot(root) {
		switch (root) {
			case 'blog':
				return 'blog';
			case 'posts':
				return 'post';
			default:
				return this._super(root);
		}
	},
	
	normalizePayload: function normalizePayload(payload) {
		delete payload.total_posts;
		
		if (payload.blog && payload.posts && payload.posts.length) {
			var a = document.createElement('a');
			a.href = payload.blog.url;
			
			payload.posts.forEach(function forEach(post) {
				post.blog = a.host;
			});
			
			a = null;
		}
		
		return this._super(payload);
	},
	
	normalizeHash: {
		blog: function normalizeHashBlog(hash) {
			//hash.id = hash.name;
			var a = document.createElement('a');
			a.href = hash.url, hash.id = a.host, a = null;
			return hash;
		}
	},
	
	extract: function extract(store, type, payload, id, requestType) {
		var response = Ember.get(payload, 'response');
		
		// extract blog from /posts request; saves on extra /info request
		if (type === App.Post)
			store.push(App.Blog, this._super(store, App.Blog, Ember.getProperties(response, 'blog'), App.host, 'find'));
		
		return this._super(store, type, response, id, requestType);
	},
	
	extractMeta: jQuery.noop
});

App.ApplicationAdapter = DS.RESTAdapter.extend({
	find: function find(store, type, id) {
		return this.findQuery(store, type, { id: id });
	},
	
	findAll: function findAll(store, type, sinceToken) {
		return this.findQuery(store, type);
	},
	
	// API can only retrieve 20 posts
	findQuery: function findQuery(store, type, query) {
		if (type === App.Post && query)
			var queryData = Ember.getProperties(query, 'id', 'limit', 'offset', 'tag', 'type');
		
		return this.ajax(this.buildURL(type.typeKey), 'GET', queryData && { data: queryData }).then(function then(data) {
			return Ember.get(data, 'meta.status') == 200
				? data
				: Ember.RSVP.reject(new Error(Ember.get(data, 'meta.status') + ': ' + Ember.get(data, 'meta.msg')));
		});
	},
	
	findMany: function findMany(store, type, ids) {
		console.warn('findMany not implemented', store, type, ids);
		throw new Error('findMany not implemented');
	},
	
	findHasMany: function findHasMany(store, record, url) {
		console.warn('findHasMany not implemented', store, record, url);
		throw new Error('findHasMany not implemented');
	},
	
	findBelongsTo: function findBelongsTo(store, record, url) {
		console.warn('findBelongsTo not implemented', store, record, url);
		throw new Error('findBelongsTo not implemented');
	},
	
	createRecord: function createRecord(store, type, record) {
		console.warn('createRecord not implemented', store, type, record);
		throw new Error('createRecord not implemented');
	},
	
	updateRecord: function updateRecord(store, type, record) {
		console.warn('updateRecord not implemented', store, type, record);
		throw new Error('updateRecord not implemented');
	},
	
	deleteRecord: function deleteRecord(store, type, record) {
		console.warn('deleteRecord not implemented', store, type, record);
		throw new Error('deleteRecord not implemented');
	},
	
	buildURL: function buildURL(type) {
		return 'https://api.tumblr.com/v2/blog/'
			+ App.host
			+ '/'
			+ this.pathForType(type);
	},
	
	pathForType: function pathForType(type) {
		switch (type) {
			case 'post':
				return 'posts';
			case 'blog':
				return 'info';
			default:
				throw new Error('Type `' + type + '` not supported');
		}
	},
	
	urlPrefix: function urlPrefix(path, parentURL) {
		return '';
	},
	
	ajaxOptions: function ajaxOptions(url, reqType, hash) {
		hash || (hash = { });
		hash.url = url;
        
		if (url.slice(-'/info'.length) === '/info')
			hash.data = { };
		else {
			hash.data || (hash.data = { });
			
			hash.data.reblog_info = true;
			//hash.data.notes_info = true;
			
			if (hash.data.type) {
				hash.url += '/' + hash.data.type;
				delete hash.data.type;
			}
		}
		
		hash.data.api_key = App.APIKey;
		
		hash.dataType = 'jsonp';
        hash.context = this;
		
		return hash;
	}
});

/*App.Router.reopen({
	location: 'history'
});*/

App.Router.map(function routerMap() {
	this.route('page', { path: 'page/:page_num' });
	this.route('post', { path: 'post/:post_id' });
	this.route('tag',  { path: 'tagged/:tag' });
	this.route('type', { path: 'type/:post_type' });
});

App.ApplicationController = Ember.Controller.extend({
	updateTitle: function updateTitle() {
		document.title
			= (this.get('pageTitle') || '')
				+ (this.get('pageTitle') ? ' – ' : '')
				+ this.get('blogTitle');
	}.observes('pageTitle', 'blogTitle').on('init'),
	
	updateCurrentRouteName: function updateCurrentRouteName() {
		this.set('_controller',
			this.get('currentRouteName')
				&& App.__container__.lookup('controller:' + this.get('currentRouteName')));
		
		window.scrollTo(0, 0);
	}.observes('currentRouteName'),
	
	updateFavicon: function updateFavicon() {
		var a = document.createElement('a');
		a.href = this.get('blog.url');
		
		var link = document.querySelector('link[rel="shortcut icon"]');
		link && link.remove();
		
		if (a.host) {
			link = document.createElement('link'), link.rel = 'shortcut icon';
			link.href = 'https://api.tumblr.com/v2/blog/' + a.host + '/avatar/16';
			document.head.appendChild(link);
		}
		
		a = null;
	}.observes('blog.url'),
	
	pageTitle: Ember.computed.alias('_controller._title'),
	
	blogTitle: function blogTitle() {
		return this.get('blog.title')
			|| this.get('blog.id')
			|| App.host;
	}.property('blog.title', 'blog.id'),
	
	askHref: function askHref() {
		return this.get('blog.url')
			&& (this.get('blog.url') + 'ask');
	}.property('blog.url'),
	
	followHref: function followHref() {
		return this.get('blog.name')
			&& ('https://www.tumblr.com/follow/' + this.get('blog.name'));
	}.property('blog.name')
});

App.ApplicationRoute = Ember.Route.extend({
	setupController: function setupController(controller) {
		controller.set('blog', this.get('store').find('blog', App.host));
	}
});

App.PageController = Ember.ArrayController.extend({
	needs: 'application',
	
	sortProperties: [ 'timestamp' ],
	sortAscending: false,
	
	_title: function _title() {
		return I18n.t('currentPage', this.getProperties('page', 'numPages'));
	}.property('page', 'numPages'),
	
	page: 1,
	
	numPages: function numPages() {
		return (this.get('controllers.application.blog.posts') / 20 | 0) + 1;
	}.property('controllers.application.blog.posts'),
	
	isFirstPage: Ember.computed.equal('page', 1),
	
	isLastPage: function isLastPage() {
		return this.get('page') === this.get('numPages');
	}.property('page', 'numPages'),
	
	previousPageHref: function previousPageHref() {
		var router = this.get('container').lookup('router:main');
		
		if (this.get('page') === 2)
			return router.generate('index');
		else
			return router.generate('page', Math.max(this.get('page') - 1, 1));
	}.property('page'),
	
	nextPageHref: function nextPageHref() {
		var router = this.get('container').lookup('router:main');
		return router.generate('page', this.get('page') + 1);
	}.property('page')
});

App.cachePages && App.PageController.reopenClass({
	pages: { }
});

App.PageRoute = Ember.Route.extend({
	model: function model(params) {
		var page = params.page_num | 0;
		this.controllerFor('page').set('page', page);
		
		return (App.cachePages && App.PageController.pages[page])
			|| this.get('store').find('post', { limit: 20, offset: 20 * (page - 1) })
				.then(function then(posts) {
					App.cachePages && (App.PageController.pages[page] = posts);
					return posts;
				});
	},
	
	afterModel: function afterModel(posts, transition) {
		if (this.controllerFor('page').get('page') <= 1)
			this.transitionTo('index');
	}
});

App.IndexRoute = App.PageRoute.extend({
	controllerName: 'page',
	templateName: 'page',
	
	model: function model(params) {
		return this._super({ page_num: 1 });
	},
	
	afterModel: jQuery.noop
});

App.TagController = Ember.ArrayController.extend({
	sortProperties: [ 'timestamp' ],
	sortAscending: false,
	
	_title: function _title() {
		return I18n.t('tag', this.getProperties('tag'));
	}.property('tag')
});

App.cachePages && App.TagController.reopenClass({
	tags: { }
});

App.TagRoute = Ember.Route.extend({
	model: function model(params) {
		this.controllerFor('tag').set('tag', params.tag);
		
		return (App.cachePages && App.TagController.tags[params.tag])
			|| this.get('store').find('post', { tag: params.tag })
				.then(function then(posts) {
					App.cachePages && (App.TagController.tags[params.tag] = posts);
					return posts;
				});
	}
});

App.TypeController = Ember.ArrayController.extend({
	sortProperties: [ 'timestamp' ],
	sortAscending: false,
	
	_title: function _title() {
		return I18n.t('postType.other', this.getProperties('type'));
	}.property('type')
});

App.cachePages && App.TypeController.reopenClass({
	types: { }
});

App.TypeRoute = Ember.Route.extend({
	model: function model(params) {
		this.controllerFor('type').set('type', params.post_type);
		
		return (App.cachePages && App.TypeController.types[params.post_type])
			|| this.get('store').find('post', { type: params.post_type })
				.then(function then(posts) {
					App.cachePages && (App.TypeController.types[params.post_type] = posts);
					return posts;
				});
	}
});

App.PostController = Ember.ObjectController.extend({
	_title: function _title() {
		var title;
		
		switch (this.get('type')) {
			case 'text':
			case 'link':
			case 'chat':
				title = this.get('title');
				break;
			case 'photo':
			case 'audio':
			case 'video':
				var span = document.createElement('span');
				span.innerHTML = this.get('caption'), title = span.innerText || span.textContent, span = null;
				break;
			case 'quote':
				var span = document.createElement('span');
				span.innerHTML = this.get('text'), title = span.innerText || span.textContent, span = null;
				break;
			case 'answer':
				title = this.get('question');
				break;
		}
		
		return title
			|| this.get('slug')
			|| I18n.t('postIdTitle', this.getProperties('id', 'type'));
	}.property('type', 'title', 'caption', 'text', 'question', 'slug', 'id')
});

App.SinglePostView = Ember.View.extend({
	classNames: 'post',
	classNameBindings: 'type',
	tagName: 'article',
	templateName: 'post-view',
	
	isText:      Ember.computed.equal('post.type', 'text'),
	isPhotoType: Ember.computed.equal('post.type', 'photo'),
	isQuote:     Ember.computed.equal('post.type', 'quote'),
	isLink:      Ember.computed.equal('post.type', 'link'),
	isChat:      Ember.computed.equal('post.type', 'chat'),
	isAudio:     Ember.computed.equal('post.type', 'audio'),
	isVideo:     Ember.computed.equal('post.type', 'video'),
	isAnswer:    Ember.computed.equal('post.type', 'answer'),
	
	monoPhoto:  Ember.computed.equal('post.photos.length', 1),
	polyPhotos: Ember.computed.gt('post.photos.length', 1),
	
	isPhoto:    Ember.computed.and('isPhotoType', 'monoPhoto'),
	isPhotoSet: Ember.computed.and('isPhotoType', 'polyPhotos'),
	
	type: function type() {
		return this.get('isPhotoSet') ? 'photoset' : this.get('post.type');
	}.property('post.type', 'isPhotoSet'),
	
	images: function images() {
		return this.get('post.photos').mapBy('original_size').map(function map(image) {
			Ember.set(image, 'url', Ember.get(image, 'url').replace(/^http:/i, 'https:')); // Tumblr images work over http: and https: but we prefer https:
			Ember.set(image, 'nullWidth', Ember.get(image, 'width') === 0);
			return image;
		});
	}.property('post.photos.@each.original_size'),
	
	image: Ember.computed.alias('images.firstObject'),
	
	reblogHref: function reblogHref() {
		return 'https://www.tumblr.com/reblog/'
			+ this.get('post.id')
			+ '/'
			+ this.get('post.reblogKey');
	}.property('post.id', 'post.reblogKey'),
	
	fromTime: function fromTime() {
		return moment.unix(this.get('post.timestamp')).fromNow();
	}.property('post.timestamp'),
	
	tick: function tick() {
		this.notifyPropertyChange('fromTime');
		
		this.set('nextTick', Ember.run.later(this, this.tick, 1000 * 30));
	}.on('init'),
	
	willDestroyElement: function willDestroyElement() {
		Ember.run.cancel(this.get('nextTick'));
	}
});

App.Blog = DS.Model.extend({
	title:       DS.attr('string'),
	posts:       DS.attr('number'),
	name:        DS.attr('string'),
	updated:     DS.attr('number'),
	description: DS.attr('string'),
	ask:         DS.attr('boolean'),
	askAnon:     DS.attr('boolean', { defaultValue: false }),
	likes:       DS.attr('number',  { defaultValue: 0 }),
	
	url:          DS.attr('string'),
	askPageTitle: DS.attr('string', { defaultValue: null }),
	isNsfw:       DS.attr('boolean'),
	shareLikes:   DS.attr('boolean')
});

App.Blog.reopenClass({
	typeKey: 'blog'
});

App.Post = DS.Model.extend({
	// All post types
	blogName:    DS.attr('string'),
	//id:          DS.attr('number'),
	postUrl:     DS.attr('string'),
	slug:        DS.attr('string'),
	type:        DS.attr('string'),
	timestamp:   DS.attr('number'),
	date:        DS.attr('string'),
	format:      DS.attr('string'),
	reblogKey:   DS.attr('string'),
	tags:        DS.attr('array'),
	bookmarklet: DS.attr('boolean', { defaultValue: false }),
	mobile:      DS.attr('boolean', { defaultValue: false }),
	sourceUrl:   DS.attr('string'),
	sourceTitle: DS.attr('string'),
	//liked:       DS.attr('boolean'),
	state:       DS.attr('string'),
	
	shortUrl:    DS.attr('string'),
	highlighted: DS.attr('array'),
	noteCount:   DS.attr('number'),
	
	// Text posts
	title: DS.attr('string'),
	body:  DS.attr('string'),
	
	// Photo posts
	photos:  DS.attr('array'),
	caption: DS.attr('string'),
	width:   DS.attr('number'),
	height:  DS.attr('number'),
	
	imagePermalink: DS.attr('string'),
	
	// Quote posts
	text:   DS.attr('string'),
	source: DS.attr('string'),
	
	// Link posts
	title:       DS.attr('string'),
	url:         DS.attr('string'),
	description: DS.attr('string'),
	
	// Chat posts
	title:    DS.attr('string'),
	body:     DS.attr('string'),
	dialogue: DS.attr('array'),
	
	// Audio posts
	caption:     DS.attr('string'),
	player:      DS.attr('string'),
	plays:       DS.attr('number'),
	albumArt:    DS.attr('string'),
	artist:      DS.attr('string'),
	album:       DS.attr('string'),
	trackName:   DS.attr('string'),
	trackNumber: DS.attr('number'),
	year:        DS.attr('number'),
	
	// Video posts
	caption: DS.attr('string'),
	player:  DS.attr('array'),
	
	// Answer posts
	askingName: DS.attr('string'),
	askingUrl:  DS.attr('string'),
	question:   DS.attr('string'),
	answer:     DS.attr('string'),
	
	// reblog_info=true
	rebloggedFromId:    DS.attr('number'),
	rebloggedFromUrl:   DS.attr('string'),
	rebloggedFromName:  DS.attr('string'),
	rebloggedFromTitle: DS.attr('string'),
	rebloggedRootUrl:   DS.attr('string'),
	rebloggedRootName:  DS.attr('string'),
	rebloggedRootTitle: DS.attr('string'),
	
	// Added by normalizePayload
	blog: DS.belongsTo('blog')
});

Ember.Handlebars.helper('i18n', function i18n(property) {
	var args = Array.prototype.slice.call(arguments, 1);
	var hash = Ember.copy(args.pop().hash);
	
	var argkeys = Object.keys(hash).filter(function filter(key) {
		return key.slice(0, 'argument'.length) === 'argument';
	}).reduce(function reduce(lval, val, idx) {
		lval[val] = hash[val];
		delete hash[val];
		return lval;
	}, { });
	
	hash = args.reduce(function reduce(lval, val, idx) {
		var key = 'argument' + idx;
		argkeys[key] && (key = argkeys[key]);
		lval[key] = val;
		return lval;
	}, hash);
	
	return I18n.t(property, hash);
});

Ember.Handlebars.helper('fromNowDate', function fromNowDate(date) {
	return moment.unix(date).fromNow();
});

Ember.Handlebars.helper('formatDate', function formatDate(date, options) {
	return moment.unix(date).format(Ember.get(options, 'hash.format'));
});