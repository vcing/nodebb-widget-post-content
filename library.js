(function (module) {
    'use strict';
    var winston = module
            .parent
            .require('winston'),
        async = module
            .parent
            .require('async'),
        nconf = module
            .parent
            .require('nconf'),
        path = require('path'),
        topics = module
            .parent
            .require('./topics'),
        templates = module
            .parent
            .require('templates.js'),
        fs = require('fs'),
        util = require('util'),
        app,
        router,
        topicController,
        controllers,
        siteUrl;

    function loadWidgetTemplate(template, next) {
        var __dirname = "./node_modules/nodebb-widget-post-content";
        var templateFile = path.resolve(__dirname, template);
        winston.info("Loading templateFile: " + templateFile);

        fs.readFile(templateFile, function (err, data) {
            if (err) {
                console.log(err.message);
                return next(null, err);
            }
            next(data.toString());
        });
    }

    var postContent = {
        load: function (params, callback) {
            winston.info("==================post content working===================");
            app = params.app;
            router = params.router;
            controllers = params.controllers;
            topicController = controllers.topics;

            if (typeof callback === 'function') {
                callback();
            }
        },
        getWidgets: function (widgets, callback) {
            loadWidgetTemplate('./templates/nodebb-widget-post-content/admin/post-content.tpl', function (templateData) {
                widgets = widgets.concat([
                    {
                        widget: "post-content",
                        name: "Post Widget",
                        description: "Renders the content of a post content",
                        content: templateData
                    }
                ]);

                callback(null, widgets);
            });
        },
        render: function (params, callback) {
            let ll = Object.assign({}, params);
            delete ll['req'];
            delete ll['res'];
            console.log(ll);
            var mockReq;
            try {
                /*
				winston.info("renderpostContentWidget params: " + util.inspect(params), {
					showHidden: false,
					depth: 1
				});
				*/

                mockReq = {
                    uid: params.uid,
                    params: {
                        topic_id: '',
                        slug: ''
                    },
                    query: {
                        sort: 'oldest_to_newest'
                    },
                    session: {
                        returnTo: ''
                    }

                };

                // rule analysis
                if (!isNaN(params.data.rules)) {
                    mockReq.params.topic_id = params.data.rules;
                } else {
                    try {
                        var rule = JSON.parse(params.data.rules);
                        var urls = params.area.url.split('/');
                        var currentOption = false;
                        urls.map(function(_param) {
                            if(!isNaN(currentOption) && currentOption !== false)return;
                            if(currentOption === false) {
                                currentOption = rule[_param] || rule['all'] || null;
                            }else {
                                currentOption = currentOption[_param] || currentOption['all'] || null;
                            };
                        });
                        if(!isNaN(currentOption))mockReq.params.topic_id = currentOption;
                    } catch (e) {
                        winston.error("Error while rendering post content widget rules: "+params.data.rules+" Error:");
                        winston.error(e);
                        return;
                    }
                }

                console.log(mockReq.params.topic_id);
                if(!mockReq.params.topic_id)return;

                if (params.data.renderAsUserId) {
                    mockReq.uid = params.data.renderAsUserId;
                }

                /**
				 * Create a wrapped response object to intercept the subsequent app rendering of the widget
				 */
                var resWrap = {
                    locals: {},
                    redirect: function (path) {},
                    status: function (code) {
                        return {
                            render: function (code, data) {
                                winston.info("postContentWidget " + code + " redirect intercepted for uid: " + params.uid + " post.id: " + mockReq.params.topic_id + " data: " + util.inspect(data))
                            }
                        }
                    },
                    render: function (template, data) {
                        // winston.info("postContent.render template requested: " +
                        // util.inspect(template));
                        winston.info("postContent tid: " + data.tid);
                        data.postid = data.tid;
                        data.postShowTitle = params.data.postShowTitle;
                        data.postLinkTitle = params.data.postLinkTitle;
                        data.postUrl = nconf.get('url') + "/topic/" + data.tid;

                        // winston.info("postContent.render data: " + util.inspect(data, {showHidden:
                        // false, depth: 1})); winston.info("postContent about to render post id: " +
                        // data.postid);
                        app.render("nodebb-widget-post-content/post-content", data, callback);
                    }
                };

                /**
				 * Here we need to preemptively load the topic slug, because the topicController gets upset
				 * if we don't pass that along with the rendering of the topic
				 */
                async.waterfall([
                    function (next) {
                        topics.getTopicData([parseInt(mockReq.params.topic_id)], next);
                    },
                    function (topic, next) {
                        console.log('aaaaaaaaaa:',topic);
                        console.log(mockReq.params.topic_id);
                        mockReq.params.slug = topic
                            .slug
                            .replace(/\d+\//g, "");
                        // winston.info("Intercepted topic request. topic id: " +
                        // mockReq.params.topic_id + " (slug from db): " + mockReq.params.slug);
                        topicController.get(mockReq, resWrap, callback);
                    }
                ]);
            } catch (err) {
                winston.error("Error while rendering post content widget: " + util.inspect(mockReq) + " Error:");
                winston.error(err);
            }
        }
    }

    module.exports = postContent;
}(module));