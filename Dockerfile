FROM livingdocs/node:12.0

COPY package.json /app/
RUN npm install --production && npm cache clean -f
COPY . /app/
ENV PORT 8080
EXPOSE 8080
CMD ["node", "/app/index.js"]
