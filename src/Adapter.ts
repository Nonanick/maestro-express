import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import { EventEmitter } from 'events';
import express, { Application, CookieOptions, NextFunction, Request, Response } from 'express';
import { Server } from 'http';
import { Container, HTTPMethod, IAdapter, ICommand, IContainer, IProxiedRoute, Maestro, RequestFlowNotDefined } from 'maestro';
import { ErrorHandler } from './errorHandler/ErrorHandler';
import { Events } from './events/Events';
import { SendResponse } from './sendResponse/SendResponse';
import { TransformRequest } from './transformRequest/TransformRequest';

export class Adapter extends EventEmitter implements IAdapter {

	static CreateCookie = (name: string, value: string, options: CookieOptions) => {
		let createCookieCommand: ICommand = {
			name: 'create-cookie',
			adapters: [Adapter.ADAPTER_NAME],
			payload: {
				name,
				value,
				...options
			}
		};

		return createCookieCommand;
	};

	public static ADAPTER_NAME = "Express";

	public static DEFAULT_PORT = 3000;

	get name(): string {
		return Adapter.ADAPTER_NAME;
	}

	get port(): number {
		return this._port;
	}

	/**
	 * Express application
	 * -------------------
	 * Holds the actual express application
	 * 
	 */
	protected express: Application;

	/**
	 * Containers
	 * ------------
	 * Hold all the API Containers that will be exposed to the 
	 * Express Adapter
	 */
	protected containers: Container[] = [];

	/**
	 * Port
	 * ----
	 * Which port the adapter will run
	 */
	protected _port: number = Number(process.env.EXPRESS_PORT) ?? 3333;

	/**
	 * Booted
	 * -------
	 * Boot state of the adapter
	 */
	protected _booted = false;

	/**
	 * Started
	 * --------
	 * Start state of the adapter
	 */
	protected _started = false;

	/**
	 * Server
	 * ------
	 * HTTP Server created when the adapter is started
	 */
	protected _server?: Server;

	/**
	 * Loaded Routes
	 * --------------
	 * All Routes that were already 'loaded'
	 * and are therefore exposed 
	 */
	protected _loadedRoutes: IProxiedRoute[] = [];

	/**
	 * Transform Request
	 * -----------------
	 * Holds the function that shall normalize a Request input
	 * into an *IApiRouteRequest*
	 */
	protected _transformRequest: typeof TransformRequest = TransformRequest;

	/**
	 * Send Response
	 * ---------------
	 * Holds the function that shall output an IApiRouteResponse
	 * as an actual HTTP Response (usually in JSON format)
	 */
	protected _sendResponse: typeof SendResponse = SendResponse;

	/**
	 * Request Handler
	 * ---------------
	 * Responsible for orchestrating the flow of a request
	 * Steps taken by the default flow:
	 * 1. Trasnform Request
	 * 2. Call the API Request Handler set in the adapter (Usually an APIMaestro handle function)
	 * > 2.1 The API Handler has access to a normalized function to either send the IApiRouteResponse
	 * > or an error
	 * 
	 * @param route Route that the request is directed to
	 * @param method Http method used to fetch the request
	 * @param request Express Request object
	 * @param response Express Response object
	 * @param next Express NextFunction, usually called when an error has ocurred
	 */
	protected _requestHandler = async (
		route: IProxiedRoute,
		method: HTTPMethod,
		request: Request,
		response: Response,
		next: NextFunction
	) => {

		if (typeof this._apiHandler !== "function") {
			let error = new RequestFlowNotDefined(
				'Express adapter does not have an associated api request handler'
			);
			this._errorHandler(
				response,
				next,
				error
			);
			this.emit(Events.REQUEST_ERROR, error, route, request);
		}

		// Create API Request
		let apiRequest = this._transformRequest(request);
		apiRequest.method = method;

		// Send it to API Handler
		this._apiHandler!(
			route,
			apiRequest,
			(routeResp) => {
				this._sendResponse(routeResp, response);
				this.emit(Events.REQUEST_RESPONSE, routeResp, route);
			},
			(error) => {
				this._errorHandler(response, next, error);
				this.emit(Events.REQUEST_ERROR, error, route, request);
			}
		);

	};

	/**
	 * Actual API Handler
	 * -------------------
	 * Express adapter is only responsible for normalizing the Input/Output
	 * of the API, therefore properly translating the Express request
	 * into an *IApiRouteRequest* and them outputting the *IApiRouteResponse*
	 * 
	 * All other steps should be done by an 'api request handler', how this handler
	 * will manage all the processes of validating the request, calling the resolver
	 * checking for possible errors and so on is no concern to the adapter!
	 */
	protected _apiHandler?: Maestro['handle'];

	/**
	 * Error Handler
	 * --------------
	 * Function that allows the API Handler to output errors through the default
	 * Express Error Handler or any other adapter error handler
	 */
	protected _errorHandler: typeof ErrorHandler = ErrorHandler;


	constructor(port?: number) {
		super();
		this.express = express();
		this.onPort(port ?? Adapter.DEFAULT_PORT);
	}

	/**
	 * [SET] Transform Request Function
	 * ---------------------------------
	 * Defines the function that the adapter will use to
	 * transform an Express Request into an *iApiRouteRequest*
	 * 
	 * @param func 
	 */
	setTransformRequestFunction(func: typeof TransformRequest) {
		this._transformRequest = func;
	}

	/**
	 * [SET] Send Response
	 * --------------------
	 * Defines the function that will output through express
	 * an *IApiResponse* object
	 * 
	 * @param func 
	 */
	setSendResponseFunction(func: typeof SendResponse) {
		this._sendResponse = func;
	}

	/**
	 * [SET] Error Handler
	 * -------------------
	 * Defines how the adapter will output errors
	 * @param handler 
	 */
	setErrorHanlder(handler: typeof ErrorHandler) {
		this._errorHandler = handler;
	}

	/**
	 * [SET] Request Handler
	 * ----------------------
	 * Defines the function that will actually be responsible
	 * for transforming the IApiRouteRequest into an IAPiRouteResponse
	 * 
	 * All other steps like parameter validation, schema validation
	 * check for errors must be done by this handler
	 * 
	 * @param handler 
	 */
	setRequestHandler(handler: Maestro['handle']) {
		this._apiHandler = handler;
	}

	/**
	 * [ADD] API Container
	 * --------------------
	 * Add a new API Container to the Express adapter
	 * exposing its routes as accessible URL's when
	 * the adapter in started
	 * 
	 * @param container 
	 */
	addContainer(container: Container) {
		// Prevent duplicates
		if (!this.containers.includes(container)) {
			this.containers.push(container);
		}
	}



	boot() {

		if (this._booted) return;

		// Add needed express capabilities
		this.express.use(bodyParser.json());
		this.express.use(bodyParser.urlencoded({ extended: true }));
		this.express.use(cookieParser());

		this.express.disable('x-powered-by');

		console.debug("\nAll available routes:\n----------------------");
		// Add all routes from currently known containers
		this.loadRoutesFromContainers(this.containers);
		console.debug();
		this._booted = true;
	}

	/**
	 * Load Routes From Containers
	 * ---------------------------
	 * Crawls into the container fetching all exposed routes
	 * Assign them to the express server using the adapters
	 * *Request Handler*
	 * 
	 * @param containers All Containers that will have their api routes exposed
	 */
	loadRoutesFromContainers(containers: IContainer[]) {

		for (let container of containers) {

			const allRoutes = container.allRoutes();

			for (let route of allRoutes) {
				// Already loaded? Do not add duplicates
				if (this._loadedRoutes.includes(route)) {
					continue;
				}
				let methods: HTTPMethod[];

				if (!Array.isArray(route.methods)) {
					methods = [route.methods];
				} else {
					methods = route.methods;
				}

				methods.forEach(
					m => console.debug(`${m.toLocaleUpperCase()}\t- ${route.url}`)
				);

				for (let method of methods) {
					this.addRouteToHttpMethod(method, route);
				}

				this._loadedRoutes.push(route);

			}
		}
	}

	/**
	 * Add Route to HTTP Method
	 * ------------------------
	 * Actually binds the Api Route resolver to the URL + Method
	 * it is assigned to into the express app;
	 * 
	 * @param method HTTPMethod that will be listened
	 * @param route Route corresponding to the URL + Method
	 */
	protected addRouteToHttpMethod(method: HTTPMethod, route: IProxiedRoute) {
		let url: string;

		if (route.url.trim().charAt(0) !== '/') {
			url = '/' + route.url.trim();
		} else {
			url = route.url.trim();
		}

		switch (method) {
			case 'all':
				this.express.all(url, (req, res, next) => {
					this._requestHandler(route, method, req, res, next);
				});
				this.emit(Events.ALL_REQUEST, route);
				break;
			case 'get':
				this.express.get(url, (req, res, next) => {
					this._requestHandler(route, method, req, res, next);
				});
				this.emit(Events.GET_REQUEST, route);
				break;
			case 'search':
				this.express.search(url, (req, res, next) => {
					this._requestHandler(route, method, req, res, next);
				});
				this.emit(Events.GET_REQUEST, route);
				break;
			case 'post':
				this.express.post(url, (req, res, next) => {
					this._requestHandler(route, method, req, res, next);
				});
				this.emit(Events.POST_REQUEST, route);
				break;
			case 'put':
				this.express.put(url, (req, res, next) => {
					this._requestHandler(route, method, req, res, next);
				});
				this.emit(Events.PUT_REQUEST, route);
				break;
			case 'patch':
				this.express.patch(url, (req, res, next) => {
					this._requestHandler(route, method, req, res, next);
				});
				this.emit(Events.PATCH_REQUEST, route);
				break;
			case 'delete':
				this.express.delete(url, (req, res, next) => {
					this._requestHandler(route, method, req, res, next);
				});
				this.emit(Events.DELETE_REQUEST, route);
				break;
			case 'head':
				this.express.head(url, (req, res, next) => {
					this._requestHandler(route, method, req, res, next);
				});
				this.emit(Events.HEAD_REQUEST, route);
				break;
			case 'options':
				this.express.options(url, (req, res, next) => {
					this._requestHandler(route, method, req, res, next);
				});
				this.emit(Events.OPTIONS_REQUEST, route);
				break;
			case 'connect':
				this.express.connect(url, (req, res, next) => {
					this._requestHandler(route, method, req, res, next);
				});
				this.emit(Events.CONNECT_REQUEST, route);
				break;
			case 'trace':
				this.express.trace(url, (req, res, next) => {
					this._requestHandler(route, method, req, res, next);
				});
				this.emit(Events.TRACE_REQUEST, route);
				break;
		}

		this.emit(Events.REQUEST, route, method);

	}

	/**
	 * On Port
	 * --------
	 * Defines the port the server should be started at
	 * Cannot be modified once the server has started
	 * 
	 * @param port 
	 */
	onPort(port: number) {
		if (this._started) return;
		this._port = port;
	}

	start() {
		this.boot();
		this._server = this.express.listen(this._port);
		this._started = true;
	}

	stop() {
		if (this._started) {
			this._server!.close();
			this._started = false;
		}
	}

	loadedRoutes(): RoutesByURL {
		let loaded: RoutesByURL = {};
		for (let route of this._loadedRoutes)
			loaded[route.url] = route;

		return loaded;
	}

}

type RoutesByURL = {
	[routeURL: string]: IProxiedRoute;
};