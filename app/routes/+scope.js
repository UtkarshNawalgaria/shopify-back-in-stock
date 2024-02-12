import cors from "@fastify/cors"
import { api } from "gadget-server"


export default async function (server) {
    await server.register(cors, {
        origin: true
    })
}