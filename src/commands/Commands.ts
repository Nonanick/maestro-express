import { Response, CookieOptions } from 'express';

export const Commands = {

  // Set Header - Command
  'setHeader': (response: Response, headers: ExpressCommandSetHeaderPayload) => {
    for (let headerName in headers) {
      response.setHeader(headerName, headers[headerName]);
    }
  },

  // Set Cookie - Command
  'setCookie': (response: Response, cookies: ExpressCommandSetCookiePayload) => {
    for (let cookieName in cookies) {
      response.cookie(cookieName, cookies[cookieName].value, cookies[cookieName]);
    }
  }
};

export type KnownExpressCommands = keyof typeof Commands;

export type ExpressCommandSetHeaderPayload = {
  [name: string]: string;
};

export type ExpressCommandSetCookiePayload = {
  [cookieName: string]: CookieOptions & { value: string; };
};