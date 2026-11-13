"use strict";

const mongoose = require("mongoose");
const DefaultDataset = require("../model/SplunkLabDataset");
const DefaultEvent = require("../model/SplunkLabEvent");

let trainingConnection = null;
let connectionError = null;
let initialization = null;

function usesSupabaseTrainingStore() {
  return String(process.env.SPLUNK_TRAINING_STORE || "").toLowerCase() === "supabase";
}

function isDedicatedTrainingStoreConfigured() {
  return Boolean(process.env.SPLUNK_TRAINING_DATABASE_URL);
}

function activeConnection() {
  if (isDedicatedTrainingStoreConfigured() && !trainingConnection) return null;
  return trainingConnection || mongoose.connection;
}

function isTrainingStoreReady() {
  if (usesSupabaseTrainingStore()) return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const connection = activeConnection();
  return !isDedicatedTrainingStoreConfigured() || connection?.readyState === 1;
}

function getDatasetModel() {
  if (!trainingConnection) return DefaultDataset;
  return trainingConnection.models[DefaultDataset.modelName]
    || trainingConnection.model(DefaultDataset.modelName, DefaultDataset.schema, "splunk_lab_datasets");
}

function getEventModel() {
  if (!trainingConnection) return DefaultEvent;
  return trainingConnection.models[DefaultEvent.modelName]
    || trainingConnection.model(DefaultEvent.modelName, DefaultEvent.schema, "splunk_lab_events");
}

function initializeSplunkTrainingStore() {
  if (usesSupabaseTrainingStore()) {
    const store = require("./splunkSupabaseTrainingStore");
    initialization = store.initialize();
    return initialization;
  }
  const uri = process.env.SPLUNK_TRAINING_DATABASE_URL;
  if (!uri) return Promise.resolve(false);
  if (initialization) return initialization;

  trainingConnection = mongoose.createConnection(uri, { serverSelectionTimeoutMS: 10000, autoIndex: false });
  initialization = trainingConnection.asPromise()
    .then(() => { connectionError = null; return true; })
    .catch((error) => {
      connectionError = error;
      throw error;
    });
  return initialization;
}

function trainingStoreUnavailableError() {
  const error = new Error("The stored training dataset service is not connected. Try again later.");
  error.status = 503;
  if (connectionError) error.cause = connectionError;
  return error;
}

module.exports = {
  getDatasetModel,
  getEventModel,
  initializeSplunkTrainingStore,
  isDedicatedTrainingStoreConfigured,
  isTrainingStoreReady,
  trainingStoreUnavailableError,
  usesSupabaseTrainingStore,
};
