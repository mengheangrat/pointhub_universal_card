# Use an official Node runtime as a parent image
FROM node:16-alpine

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Set the working directory to src
WORKDIR /app/src

# Expose the port the app runs on
EXPOSE 3000

# Run the application
CMD ["node", "index.js"]
