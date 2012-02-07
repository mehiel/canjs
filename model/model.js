// this file should not be stolen directly
steal('can/observe',function(){
	

	var	pipe = function(def, model, func){
		var d = Can.Deferred();
		def.done(function(){
			arguments[0] = model[func](arguments[0])
			d.resolve.apply(d, arguments)
		});
		def.fail((function(){
			d.resolveWith.apply(this,arguments)
		}))
		return d;
	},
		getId = function( inst ) {
			return inst[inst.constructor.id]
		},
		trigger = Can.trigger,
		ajax = function(ajaxOb, data, type, dataType, success, error ) {

			
			// if we get a string, handle it
			if ( typeof ajaxOb == "string" ) {
				// if there's a space, it's probably the type
				var parts = ajaxOb.split(" ")
				ajaxOb = {
					url : parts.pop(),
					type : parts.pop()
				};
			}

			// if we are a non-array object, copy to a new attrs
			ajaxOb.data = typeof data == "object" && !Can.isArray(data) ?
				Can.extend(ajaxOb.data || {}, data) : data;
	

			// get the url with any templated values filled out
			ajaxOb.url = Can.String.sub(ajaxOb.url, ajaxOb.data, true);

			return Can.ajax(Can.extend({
				type: type || "post",
				dataType: dataType ||"json",
				success : success,
				error: error
			},ajaxOb));
		},
		makeRequest = function( self, type, success, error, method ) {
			var deferred ,
				args = [self.serialize()],
				// the Model
				model = self.constructor,
				jqXHR;

			// destroy does not need data
			if ( type == 'destroy' ) {
				args.shift();
			}
			// update and destroy need the id
			if ( type !== 'create' ) {
				args.unshift(getId(self))
			}
			
			jqXHR = model[type].apply(model, args);
			
			deferred = jqXHR.pipe(function(data){
				self[method || type + "d"](data, jqXHR);
				return self
			})
			//promise = deferred.promise();
			// hook up abort
			if(jqXHR.abort){
				deferred.abort = function(){
					jqXHR.abort();
				}
			}
			
			return deferred.then(success)
			.fail(error);
		}
		
	// 338
	ajaxMethods =
	/** 
	 * @Static
	 */
	{
		create: function( str , method) {
			return function( attrs ) {
				return ajax(str || this._shortName, attrs)
			};
		},
		update: function( str ) {
			return function( id, attrs ) {
				
				// move id to newId if changing id
				attrs = attrs || {};
				var identity = this.id;
				if ( attrs[identity] && attrs[identity] !== id ) {
					attrs["new" + Can.String.capitalize(id)] = attrs[identity];
					delete attrs[identity];
				}
				attrs[identity] = id;

				return ajax( str || this._url, attrs, "put")
			}
		},
		destroy: function( str ) {
			return function( id ) {
				var attrs = {};
				attrs[this.id] = id;
				return ajax( str || this._url, attrs, "delete")
			}
		},

		findAll: function( str ) {
			return function( params, success, error ) {
				return pipe( ajax( str ||  this._shortName, params, "get", "json"),
					this, 
					"models" ).done(success).fail(error);
			};
		},
		findOne: function( str ) {
			return function( params, success, error ) {
				return pipe(
					ajax(str || this._url, params, "get", "json"),
					this,
					"model").done(success).fail(error)
			};
		}
	};
	var modelNum = 0;
	Can.Observe("Can.Model",{
		setup : function(){
			Can.Observe.apply(this, arguments);
			if(this === Can.Model){
				return;
			}
			var self = this;
			
			Can.each(ajaxMethods, function(name, method){
				var prop = self[name];
				if ( typeof prop !== 'function' ) {
					self[name] = method(prop);
				}
			});
			if(self.fullName == "Can.Model"){
				self.fullName = "Model"+(++modelNum);
			}
			//add ajax converters
			
			if($.ajaxSetup){
				var converters = {},
					convertName = "* " + self.fullName + ".model";
	
				converters[convertName + "s"] = Can.proxy(self.models,self);
				converters[convertName] = Can.proxy(self.model,self);
				$.ajaxSetup({
					converters: converters
				});
			}
			this.store = {};
			this._url = this._shortName+"/{"+this.id+"}"
		},
		id: "id",
		models: function( instancesRawData ) {
			if (!instancesRawData ) {
				return null;
			}
			// get the list type
			var res = new( this.List || ML),
				// did we get an array
				arr = Can.isArray(instancesRawData),
				
				// did we get a model list?
				ml = (instancesRawData instanceof ML),
				// get the raw array of objects
				raw = arr ?
				// if an array, return the array
				instancesRawData :
				// otherwise if a model list
				(ml ?
				// get the raw objects from the list
				instancesRawData.serialize() :
				// get the object's data
				instancesRawData.data),
				// the number of items
				length = raw.length,
				i = 0;

			//!steal-remove-start
			if (!length ) {
				steal.dev.warn("model.js models has no data.  If you have one item, use model")
			}
			//!steal-remove-end
			for (; i < length; i++ ) {
				res.push(this.model(raw[i]));
			}
			if (!arr ) { //push other stuff onto array
				Can.each(instancesRawData, function(prop, val){
					if ( prop !== 'data' ) {
						res[prop] = val;
					}
				})
			}
			return res;
		},
		model: function( attributes ) {
			if (!attributes ) {
				return null;
			}
			if ( attributes instanceof this ) {
				attributes = attributes.serialize();
			}
			
			return this.store[attributes.id] || new this( attributes );
		}
	},{
		isNew: function() {
			var id = getId(this);
			// id || id === 0?
			return (id === undefined || id === null || id === ''); //if null or undefined
		},
		save: function( success, error ) {
			return makeRequest(this, this.isNew() ? 'create' : 'update', success, error);
		},
		destroy: function( success, error ) {
			return makeRequest(this, 'destroy', success, error, 'destroyed');
		},
		bind : function(){
			if(!this._bindings){
				this.constructor.store[getId(this)] = this;
				this._bindings = 0;
			}
			this._bindings++;
			return Can.Observe.prototype.bind.apply(this, arguments);
		},
		unbind : function(){
			this._bindings--;
			if(!this._bindings){
				delete this.constructor.store[getId(this)];
			}
			return Can.Observe.prototype.unbind.apply(this, arguments);
		},
		// change ID
		___set: function( prop, val ) {
			Can.Observe.prototype.___set.call(this,prop, val)
			// if we add an id, move it to the store
			if(prop === this.constructor.id && this._bindings){
				this.constructor.store[getId(this)] = this;
			}
		}
	});
		Can.each([
	/**
	 * @function created
	 * @hide
	 * Called by save after a new instance is created.  Publishes 'created'.
	 * @param {Object} attrs
	 */
	"created",
	/**
	 * @function updated
	 * @hide
	 * Called by save after an instance is updated.  Publishes 'updated'.
	 * @param {Object} attrs
	 */
	"updated",
	/**
	 * @function destroyed
	 * @hide
	 * Called after an instance is destroyed.  
	 *   - Publishes "shortName.destroyed".
	 *   - Triggers a "destroyed" event on this model.
	 *   - Removes the model from the global list if its used.
	 * 
	 */
	"destroyed"], function( i, funcName ) {
		Can.Model.prototype[funcName] = function( attrs ) {
			var stub, 
				constructor = this.constructor;

			// update attributes if attributes have been passed
			stub = attrs && typeof attrs == 'object' && this.attr(attrs.attr ? attrs.attr() : attrs);

			// call event on the instance
			trigger(this,funcName);
			trigger(this,"change",funcName)
			//!steal-remove-start
			steal.dev.log("Model.js - "+ constructor.shortName+" "+ funcName);
			//!steal-remove-end

			// call event on the instance's Class
			trigger(constructor,funcName, this);
		};
	});
	if(Can.addEvent){
		Can.Model.addEventListener = Can.addEvent;
		Can.Model.removeEventListener = Can.removeEvent;
		Can.Model.dispatchEvent  = Can.dispatch
	}
	
	var ML = Can.Observe.List('Can.Model.List',{
		setup : function(){
			Can.Observe.List.prototype.setup.apply(this, arguments );
			// send destroy events
			this.bind('change', Can.proxy(this._sendDestroy, this))
		},
		_sendDestroy : function(ev, how){
			if(/\w+\.destroyed/.test(how)){
				console.log('destroyed ...');
				this.splice(this.indexOf(ev.target),1);
			}
		}
	})
	
})
