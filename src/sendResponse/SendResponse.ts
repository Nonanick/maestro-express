import { Response } from 'express';
import { Commands } from '../commands/Commands';
import { Adapter } from '../Adapter';
import { IApiRouteResponse, ICommand } from 'auria-maestro';

export function SendResponse(routeResp: IApiRouteResponse, response: Response) {
	let send = routeResp.payload;
	if (routeResp.commands != null) {
		applyCommandsToResponse(
			response,
			routeResp.commands
		);
	}

	response
		.setHeader(
			'X-Exit-Code',
			routeResp.exitCode
		);

	response
		.status(routeResp.status)
		.send(send);
}

function applyCommandsToResponse(response: Response, commands: ICommand | ICommand[]) {

	if (Array.isArray(commands)) {
		for (let command of commands!) {
			applyCommandsToResponse(response, command);
		}
	} else {
		// Accepts array of adapters?
		if (Array.isArray(commands.adapters)) {
			// Is Express not one of them?
			if (!commands.adapters.includes(Adapter.ADAPTER_NAME)) {
				return;
			}
		}

		// Unspecified adapter or Express adapter ?
		if (commands.adapters == null || commands.adapters === Adapter.ADAPTER_NAME) {
			// Known command ?
			if ((Commands as any)[commands.name] != null) {
				(Commands as any)[commands.name](response, commands.payload);
			}
		}
	}
}