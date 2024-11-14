# Use an official Node.js runtime as a parent image
FROM node:18

# Set the working directory inside the container
WORKDIR /usr/src/v3-sdk-ts

# Install git since you'll need it to clone the repository
RUN apt-get update && apt-get install -y git

# Clone the v3-sdk-ts repository
RUN git clone https://github.com/ParclFinance/v3-sdk-ts.git /usr/src/v3-sdk-ts

RUN yarn && yarn build

WORKDIR /usr/src/app

COPY . .

# Install your app's dependencies
RUN yarn && yarn build
