const { scenarios } = require('./advancedScenarios');
const { executeAdvanced, sameResults } = require('./advancedSpl');

function runPractice({ scenarioId, taskId, query, cursor, windowMinutes = 0 }) {
  const scenario = scenarios.find(s => s.id === scenarioId);
  if (!scenario) throw new Error('Unknown practice scenario.');
  const task = scenario.tasks.find(t => t.id === taskId);
  if (!task) throw new Error('Unknown practice task.');
  const count = cursor === undefined ? scenario.events.length : cursor;
  if (!Number.isInteger(count) || count < 1 || count > scenario.events.length) throw new Error('Invalid replay position.');
  if (![0, 5, 15].includes(windowMinutes)) throw new Error('Choose all time, 5 minutes, or 15 minutes.');
  let events = scenario.events.slice(0, count);
  if (windowMinutes) {
    const seconds = time => time.split(':').reduce((total, n) => total * 60 + Number(n), 0);
    const cutoff = seconds(events.at(-1)._time) - windowMinutes * 60;
    events = events.filter(event => seconds(event._time) >= cutoff);
  }
  const actual = executeAdvanced(events, query, scenario);
  const expected = executeAdvanced(scenario.events, task.query, scenario);
  const eligible = count === scenario.events.length && windowMinutes === 0;
  const passed = eligible && sameResults(actual.rows, expected.rows, task.ordered);
  return { ...actual, passed, eligible, message: passed ? 'Task passed. Your results match the objective.' : !eligible ? 'Exploration result. Load the full capture and choose All time to check this task.' : `Search complete: ${actual.count} rows. Check the requested filters, field names, grouping${task.ordered ? ', and row order' : ''}.` };
}

module.exports = { runPractice };
