import { IRouteRequest, RouteRequest } from 'maestro';
import { Request } from 'express';
import { Adapter } from '../Adapter';

export function TransformRequest(request: Request): IRouteRequest {

  let req: IRouteRequest = new RouteRequest(Adapter.ADAPTER_NAME, request.originalUrl);

  //  Request Identification in Express is List of IP's + User Agent
  let requestIdentification = request.ips.join(' - ')
    + " | "
    + request.headers["user-agent"] ?? "UA-NOT-PROVIDED";
  req.identification = requestIdentification;

  // Add Header parameters
  for (let headerName in request.headers) {
    req.add(headerName, request.headers[headerName], 'header');
  }

  // Add Cookie parameters
  for (let cookieName in request.cookies) {
    req.add(cookieName, request.cookies[cookieName], 'cookie');
  }

  // Add Body parameters
  for (let bodyName in request.body) {
    req.add(bodyName, request.body[bodyName], 'body');
  }

  // Add QueryString parameters
  for (let qsName in request.query) {
    req.add(qsName, request.query[qsName], 'query');
  }

  // Add URL parameters
  for (let urlName in request.params) {
    req.add(urlName, request.params[urlName], 'url');
  }

  return req;
}
