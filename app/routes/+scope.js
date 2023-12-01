import FastifyCors from "fastify-cors"
import { api } from "gadget-server"


export default async function (server) {
    await server.register(FastifyCors, {
        origin: [""]
    })
}