FROM denoland/deno:latest

EXPOSE 5000

WORKDIR /app

ADD . .

RUN deno cache main.ts

CMD ["run", "-A", "main.ts"]