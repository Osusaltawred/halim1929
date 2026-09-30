FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY lib ./lib
COPY public ./public
COPY seed ./seed
# كل بيانات المستخدم (قاعدة البيانات + الصوت + الصور) تُحفظ هنا، لا داخل الصورة.
# اربط هذا المسار بـ Volume أو قرص دائم في الاستضافة.
ENV DATA_DIR=/data PORT=3000 NODE_ENV=production
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "server.js"]
