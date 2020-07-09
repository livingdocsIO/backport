FROM livingdocs/node:14

ENV NODE_ENV=production
ENV PORT 8080

COPY package*.json /app/
RUN npm ci && npm cache clean -f
COPY . /app/
EXPOSE 8080
CMD ["node", "/app/index.js"]
