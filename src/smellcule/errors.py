"""Actionable failures at command and data boundaries."""


class SmellculeError(Exception):
    """A user-facing failure with an executable next step."""

    exit_code = 2

    def __init__(self, what: str, next_step: str) -> None:
        self.what = " ".join(what.split())
        self.next_step = " ".join(next_step.split())
        if not self.what or not self.next_step:
            message = "Errors need both a description and a next step."
            raise ValueError(message)
        super().__init__(self.what)


class NotInCatalogueError(SmellculeError):
    """The query has no catalogue match."""


class ModelNotPublishedError(SmellculeError):
    """The requested release has no published revision."""


class MissingResearchExtraError(SmellculeError):
    """A research command needs optional dependencies."""


class ReleaseError(SmellculeError):
    """Release bytes could not be retrieved or verified."""

    exit_code = 1


class DataError(SmellculeError):
    """A local or downloaded data file is invalid or inaccessible."""

    exit_code = 1


NotInCatalogue = NotInCatalogueError
ModelNotPublished = ModelNotPublishedError
MissingResearchExtra = MissingResearchExtraError


class SourceChecksumError(SmellculeError, ValueError):
    """A source digest mismatch, retaining the parser error interface."""

    exit_code = 1


class SourceDownloadError(SmellculeError, OSError):
    """A source transfer failure, retaining the I/O error interface."""

    exit_code = 1
