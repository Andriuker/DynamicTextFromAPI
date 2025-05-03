// src/plugin.ts
import streamDeck, { LogLevel } from "@elgato/streamdeck";
import { HttpCallerAction } from "./actions/httpcaller"; // Importa tu clase de acción

// Configura el Logger (opcional pero útil)
streamDeck.logger.setLevel(LogLevel.TRACE); // Ajusta el nivel según necesites (DEBUG, INFO, WARN, ERROR)

// Registra tu acción asociándola con su UUID del manifest.json
streamDeck.actions.registerAction(new HttpCallerAction());

// Conecta con el software Stream Deck
streamDeck.connect();