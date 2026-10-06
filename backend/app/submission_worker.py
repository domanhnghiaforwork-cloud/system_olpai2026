"""Separate bounded processes for CPU-heavy validation/scoring, with durable leases."""
from concurrent.futures import ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool
import logging
import multiprocessing
import os
import signal
import time

from .submission_jobs import claim_jobs, evaluate_job, finish_job, heartbeat_jobs

logger = logging.getLogger(__name__)


def main():
    logging.basicConfig(level=logging.INFO)
    concurrency = max(1, min(4, int(os.getenv("SUBMISSION_WORKER_CONCURRENCY", "2"))))
    stopping = False

    def stop(_signum, _frame):
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    tasks = {}
    heartbeat_at = 0
    with ProcessPoolExecutor(max_workers=concurrency, mp_context=multiprocessing.get_context("spawn")) as pool:
        while not stopping or tasks:
            try:
                for future, job in list(tasks.items()):
                    if future.done():
                        finish_job(job, future.result())
                        del tasks[future]
                if time.monotonic() - heartbeat_at >= 5:
                    heartbeat_jobs(list(tasks.values()))
                    heartbeat_at = time.monotonic()
                if not stopping and len(tasks) < concurrency:
                    for job in claim_jobs(concurrency - len(tasks)):
                        tasks[pool.submit(evaluate_job, job)] = job
            except BrokenProcessPool:
                # Let the container restart; outstanding durable leases expire.
                logger.exception("submission_process_pool_failed")
                raise
            except Exception:
                logger.exception("submission_worker_iteration_failed")
            time.sleep(.25)


if __name__ == "__main__":
    main()
