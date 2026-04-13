import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class SocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private users = new Map<string, string>(); // userId → socketId

  handleConnection(client: Socket) {
    const userId = client.handshake.query.userId as string;

    if (userId) {
      this.users.set(userId, client.id);
      console.log('User connected:', userId);
    }
  }

  handleDisconnect(client: Socket) {
    for (const [userId, socketId] of this.users.entries()) {
      if (socketId === client.id) {
        this.users.delete(userId);
        console.log('User disconnected:', userId);
        break;
      }
    }
  }

  // 🔥 SEND NOTIFICATION
  sendNotification(userId: string, payload: any) {
    const socketId = this.users.get(userId);

    if (socketId) {
      this.server.to(socketId).emit('notification', payload);
    }
  }

  // 🔥 SEND CHAT MESSAGE
  sendMessage(userId: string, payload: any) {
    const socketId = this.users.get(userId);

    if (socketId) {
      this.server.to(socketId).emit('chat', payload);
    }
  }
  // 🔥 SEND TYPING
@SubscribeMessage("typing")
handleTyping(client: Socket, payload: any) {
  const { taskId, userName } = payload;

  // 🔥 SEND TO ALL CONNECTED USERS (TEMP FIX)
  this.server.emit("typing", payload);
}

@SubscribeMessage("stop_typing")
handleStopTyping(client: Socket, payload: any) {
  this.server.emit("stop_typing", payload);
}
}