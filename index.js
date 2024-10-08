import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { MongoClient, ObjectId, ServerApiVersion } from 'mongodb';
import { createServer } from 'node:http';
const app = express()
const port = 5000
// chat-space
// MqqA71zBPJwZzWQB
app.use(cors())
app.use(express.json())


const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: 'http://localhost:3000', // React app URL
        methods: ['GET', 'POST'],
    },
});

const uri = "mongodb+srv://chat-space:MqqA71zBPJwZzWQB@cluster0.oj1ojow.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});




async function run() {

    try {
        await client.connect();
        const userCollection = client.db("chat-space").collection('user');
        const messageCollection = client.db("chat-space").collection('message');

        app.post('/auth', async (req, res) => {
            const userInfo = req.body;
            console.log(userInfo)

            const alreadyExist = await userCollection.findOne({ email: userInfo?.email });
            console.log("data", alreadyExist);

            if (alreadyExist) {
                return res.status(400).json({
                    message: "Email Already Exists",
                    success: false,
                    data: {},
                });
            }

            // Create a new user
            const result = await userCollection.insertOne(userInfo);
            if (result.insertedId) {
                const newUser = await userCollection.findOne({ _id: result.insertedId });
                res.status(200).json({
                    message: "User Registered Successfully",
                    success: true,
                    data: newUser,
                });
            }
        })

        app.post('/auth/login', async (req, res) => {
            const userInfo = req.body;
            console.log(userInfo)

            const alreadyExist = await userCollection.findOne({ email: userInfo?.email });
            console.log("data", alreadyExist);

            if (!alreadyExist) {
                return res.status(400).json({
                    message: "User Does Not Exists",
                    success: false,
                    data: {},
                });
            }
            else {
                return res.status(200).json({
                    message: "Log In Successfull",
                    success: true,
                    data: alreadyExist,
                });
            }
        })

        app.get('/users/:id', async (req, res) => {
            const myId = req.params.id;
            console.log('myId', myId)
            const objectId = new ObjectId(myId);
            try {
                const users = await userCollection.find({ _id: { $ne: objectId } }).toArray();

                const userWithLastMessage = await Promise.all(users.map(async (user) => {

                    const lastMessage = await messageCollection.findOne({
                        $or: [
                            { senderId: myId, receiverId: user._id.toString() },
                            { senderId: user._id.toString(), receiverId: myId }
                        ]
                    }, {
                        sort: { timestamp: -1 }
                    });

                    return {
                        _id: user._id,
                        name: user.name,
                        lastMessage: lastMessage ? lastMessage.text : "No message available",
                        time: lastMessage ? lastMessage.timestamp : null
                    };
                }));

                return res.status(200).json({
                    message: "Get All Users",
                    success: true,
                    data: userWithLastMessage,
                });
            } catch (error) {
                return res.status(500).json({
                    message: "Error fetching users",
                    success: false,
                    error: error.message,
                });
            }
        });

        app.get('/single-user/:id', async (req, res) => {
            const userId = req.params.id;
            console.log('myId', userId)
            const objectId = new ObjectId(userId);
            try {
                const user = await userCollection.findOne({ _id: objectId });
                return res.status(200).json({
                    message: "Get Single User",
                    success: true,
                    data: user,
                });
            } catch (error) {
                return res.status(500).json({
                    message: "Error fetching user",
                    success: false,
                    error: error.message,
                });
            }
        });


        // Socket Io
        let users = {};

        io.on('connection', (socket) => {
            console.log('User Connected', socket.id);

            socket.on('register', (userId) => {
                users[userId] = socket.id;
            });

            socket.on('sendMessage', async (data) => {
                console.log(data);
                const { senderId, receiverId, text } = data;

                // Save Message TO DB
                const savedMessage = await messageCollection.insertOne({
                    senderId,
                    receiverId,
                    text,
                    timestamp: new Date(),
                });
                
                // send real time data to sender and receiver
                io.emit(`receiverMessage:${senderId}`, { text, senderId });
                io.emit(`receiverMessage:${receiverId}`, { text, senderId });
                // io.to(users[receiverId]).emit('receiverMessage', { text, senderId });
                // io.to(users[senderId]).emit('receiverMessage', { text, senderId });

                // if (users[receiverId]) {

                //     io.to(users[receiverId]).emit('receiverMessage', { text, senderId });
                // } else {
                //     console.log(`User ${receiverId} is not connected.`);

                // }

            });

            // Get Conversation Of Two Users
            app.get('/conversation/:user1Id/:user2Id', async (req, res) => {
                const { user1Id, user2Id } = req.params;
                console.log(user1Id, user2Id)

                const conversation = await messageCollection.find({
                    $or: [
                        { senderId: user1Id, receiverId: user2Id },
                        { senderId: user2Id, receiverId: user1Id }
                    ]
                }).sort({ timestamp: 1 }).toArray();

                res.json(conversation);
            });

            socket.on('disconnect', () => {
                console.log('User Disconnected', socket.id);
                for (const userId in users) {
                    if (users[userId] === socket.id) {
                        delete users[userId];
                        console.log(`User ${userId} with socket ID ${socket.id} removed.`);
                    }
                }
            });

        });

    } finally {

    }

}


run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('Hello World!')
})

server.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})