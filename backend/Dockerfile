FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S zootel -u 1001

# Change ownership of the app directory
RUN chown -R zootel:nodejs /app
USER zootel

EXPOSE 5000

CMD ["npm", "start"] 