#!/usr/bin/env python3
"""
Simple WebSocket server for testing Agent Assist extension
Run with: python3 test_server.py
"""

import asyncio
import websockets
import json
import random
from datetime import datetime

class AgentAssistServer:
    def __init__(self):
        self.clients = set()
        
    async def register(self, websocket):
        self.clients.add(websocket)
        print(f"Client connected. Total clients: {len(self.clients)}")
        
    async def unregister(self, websocket):
        self.clients.discard(websocket)
        print(f"Client disconnected. Total clients: {len(self.clients)}")
        
    async def send_to_all(self, message):
        if self.clients:
            await asyncio.gather(
                *[client.send(message) for client in self.clients],
                return_exceptions=True
            )
    
    async def handle_client(self, websocket, path):
        await self.register(websocket)
        try:
            # Send welcome message
            await websocket.send(json.dumps({
                "type": "system",
                "message": "Connected to Agent Assist server"
            }))
            
            # Start sending periodic updates
            asyncio.create_task(self.send_periodic_updates(websocket))
            
            async for message in websocket:
                try:
                    data = json.loads(message)
                    await self.handle_message(data, websocket)
                except json.JSONDecodeError:
                    print(f"Invalid JSON received: {message}")
                    
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            await self.unregister(websocket)
    
    async def handle_message(self, data, websocket):
        msg_type = data.get("type")
        
        if msg_type == "context":
            print(f"Context update: {data}")
            # Respond with a suggestion
            await websocket.send(json.dumps({
                "type": "suggestion",
                "content": "Great point! Consider asking follow-up questions to engage participants."
            }))
            
        elif msg_type == "audio":
            print("Audio data received")
            # Simulate transcript generation
            await websocket.send(json.dumps({
                "type": "transcript",
                "speaker": "You",
                "text": "This is a simulated transcript of your speech.",
                "timestamp": datetime.now().isoformat()
            }))
            
    async def send_periodic_updates(self, websocket):
        """Send periodic updates to simulate real-time assistance"""
        await asyncio.sleep(5)  # Wait 5 seconds before starting
        
        suggestions = [
            "Try to speak a bit slower for better clarity.",
            "Great engagement! Keep asking questions.",
            "Consider summarizing the key points discussed.",
            "Good use of active listening techniques.",
            "You might want to invite quieter participants to share."
        ]
        
        coaching_tips = [
            {
                "category": "COMMUNICATION",
                "title": "Speaking Pace",
                "content": "Your speaking pace is optimal for this type of meeting."
            },
            {
                "category": "ENGAGEMENT",
                "title": "Participant Involvement",
                "content": "Try asking more open-ended questions to encourage discussion."
            },
            {
                "category": "CLARITY",
                "title": "Message Clarity",
                "content": "Consider using more specific examples to illustrate your points."
            }
        ]
        
        try:
            while True:
                await asyncio.sleep(random.randint(10, 30))  # Random interval
                
                # Send random suggestion
                if random.random() > 0.5:
                    await websocket.send(json.dumps({
                        "type": "suggestion",
                        "content": random.choice(suggestions)
                    }))
                
                # Send coaching tip
                if random.random() > 0.7:
                    tip = random.choice(coaching_tips)
                    await websocket.send(json.dumps({
                        "type": "coaching",
                        "category": tip["category"],
                        "title": tip["title"],
                        "content": tip["content"]
                    }))
                
                # Send score update
                if random.random() > 0.8:
                    await websocket.send(json.dumps({
                        "type": "score",
                        "score": random.randint(70, 95),
                        "feedback": "Good meeting flow and participant engagement."
                    }))
                    
        except websockets.exceptions.ConnectionClosed:
            pass

async def main():
    server = AgentAssistServer()
    
    print("Starting Agent Assist WebSocket server on ws://localhost:8000/ws/meet")
    print("Press Ctrl+C to stop the server")
    
    start_server = websockets.serve(
        server.handle_client,
        "localhost",
        8000,
        subprotocols=["meet"]
    )
    
    await start_server
    await asyncio.Future()  # Run forever

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nServer stopped.")
