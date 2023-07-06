# XCCTW minecraft server Configuration

## Introduction

This is the configuration for XCCTW minecraft server, which has hosted on `minecraft://mc.xcc.tw` now.

If you want to play, please open your minecraft client and connect to `mc.xcc.tw`.

In this configuration, we use `docker-compose` to manage the server, and use `docker-compose-volume-check.yml` to check the volume.

## How to use

Basically, all server setup was done in `docker-compose.yml`, and you can use `docker-compose` to manage the server.

```bash
docker compose up -d
```

Most of the required documents are in `itzg/minecraft-server`'s website.
You can visit [here](https://docker-minecraft-server.readthedocs.io/) to get more information.

## How to add mods, datapacks, and other things

### mods

We use `mods.txt` to manage mods, and you can add mods' name in it.

### datapacks

Although we can use `datapacks.txt` to manage datapacks, but we don't use it now, since not all datapacks are placed in a solid network location.

That means when server try to download datapacks from the network, it may fail.

So we directly pre-download all datapacks and place them in `datapacks` folder.

### backup

Although we have already added `itzg/mc-backup` to backup the server, but we still need to backup the server manually.

You can use `copy-backup-example.sh` to copy the latest backup to your local computer.

```bash
./copy-backup.sh # alter the example script to your own.
```

#### backup the server immediately from the volume
The regular backup process will only backup the server once per day, but if you want to backup the server immediately, you can use the following command to do it.

```bash
rm -rf ~/volume-tmp-transfer
docker run --rm -v minecraft_mc:/data -v ~/volume-tmp-transfer:/backup alpine ash -c "cd /data ; cp -av . /backup/"
```

Then, restore the backup by the following command.

```bash
docker run --rm -v minecraft_mc:/data -v ~/volume-tmp-transfer:/backup alpine ash -c "cd /backup ; cp -av . /data/"
rm -rf ~/volume-tmp-transfer
```

## How to remove unused mods, datapacks, and other things

Usually this happened when we remove a mod "A" in `mods.txt`. The mod "A" will still in the `mods` folder, since there's no any integrations can help us apply mod-removal changes automatically. This will cause the server to crash once server's version has upgraded to a newer number but the mod "A" didn't.

So do datapacks.

Therefor, for manually removing unused mods, datapacks, and other things, we may consider to use `docker-compose-volume-check.yml` to modify the volume.

```bash
docker compose -f docker-compose-volume-check.yml up -d
```

This will immediately stop the minecraft server (if running) and initiate a new simple linux server (ubuntu) which has minecraft's volume mounted, and you can modify the volume as you want.
