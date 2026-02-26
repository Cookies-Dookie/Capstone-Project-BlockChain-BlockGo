package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"os"

	"github.com/hyperledger/fabric-chaincode-go/pkg/cid"
	"github.com/hyperledger/fabric-chaincode-go/v2/shim"
	pb "github.com/hyperledger/fabric-protos-go-apiv2/peer"
)

type Degree struct {
	ID          string `json:"id"`
	StudentHash string `json:"student_hash"` 
	Section     string `json:"section"`
	Course      string `json:"course"`
	Year        string `json:"year"`
	IpfsCID     string `json:"ipfs_cid"` 
	Amount      string `json:"amount"`
	Type        string `json:"type"`
	University  string `json:"university"`
	Date        string `json:"date"`
	Status      string `json:"status"`
}

type SmartContract struct{}

func (cc *SmartContract) Init(stub shim.ChaincodeStubInterface) *pb.Response {
	return shim.Success([]byte("OK"))
}

func (cc *SmartContract) Invoke(stub shim.ChaincodeStubInterface) *pb.Response {
	function, args := stub.GetFunctionAndParameters()
	switch function {
	case "IssueDegree":
		return cc.issueDegree(stub, args)
	case "ReadDegree":
		return cc.readDegree(stub, args)
	case "GetAllDegrees":
		return cc.getAllDegrees(stub)
	default:
		return shim.Error(fmt.Sprintf("Unknown function: %s", function))
	}
}

func (cc *SmartContract) issueDegree(stub shim.ChaincodeStubInterface, args []string) *pb.Response {
	if err := cid.AssertAttributeValue(stub, "role", "faculty"); err != nil {
		return shim.Error("Unauthorized: Only authorized faculty can issue records.")
	}

	if len(args) < 1 {
		return shim.Error("IssueDegree requires a JSON payload")
	}

	var degree Degree
	if err := json.Unmarshal([]byte(args[0]), &degree); err != nil {
		return shim.Error("Invalid JSON input")
	}

	existing, _ := stub.GetState(degree.ID)
	if existing != nil {
		return shim.Success([]byte(fmt.Sprintf(`{"status":"already_exists","id":"%s"}`, degree.ID)))
	}

	degree.University = "PLV"
	degree.Status = "Verified"

	degreeJSON, _ := json.Marshal(degree)
	if err := stub.PutState(degree.ID, degreeJSON); err != nil {
		return shim.Error(err.Error())
	}

	return shim.Success([]byte(fmt.Sprintf(`{"status":"success","id":"%s"}`, degree.ID)))
}

func (cc *SmartContract) readDegree(stub shim.ChaincodeStubInterface, args []string) *pb.Response {
	if len(args) < 1 {
		return shim.Error("readDegree requires ID")
	}

	id := args[0]
	degreeJSON, _ := stub.GetState(id)
	if degreeJSON == nil {
		return shim.Error("Degree record not found")
	}

	var degree Degree
	json.Unmarshal(degreeJSON, &degree)

	userRole, _, _ := cid.GetAttributeValue(stub, "role")
	if userRole == "student" {
		studentID, _, _ := cid.GetAttributeValue(stub, "studentID")
		h := sha256.Sum256([]byte(studentID))
		callerHash := hex.EncodeToString(h[:])

		if degree.StudentHash != callerHash {
			degree.IpfsCID = "REDACTED"
			degree.Amount = "CONFIDENTIAL"
			degreeJSON, _ = json.Marshal(degree)
		}
	}

	return shim.Success(degreeJSON)
}

func (cc *SmartContract) getAllDegrees(stub shim.ChaincodeStubInterface) *pb.Response {
	resultsIterator, err := stub.GetStateByRange("", "")
	if err != nil {
		return shim.Error(err.Error())
	}
	defer resultsIterator.Close()

	var degrees []Degree
	for resultsIterator.HasNext() {
		queryResponse, _ := resultsIterator.Next()
		var degree Degree
		json.Unmarshal(queryResponse.Value, &degree)
		degrees = append(degrees, degree)
	}

	degreesJSON, _ := json.Marshal(degrees)
	return shim.Success(degreesJSON)
}

func main() {
	server := &shim.ChaincodeServer{
		CCID:    os.Getenv("CHAINCODE_ID"),
		Address: os.Getenv("CHAINCODE_SERVER_ADDRESS"),
		CC:      &SmartContract{},
	}
	log.Printf("Starting Degree CC as a Service\n")
	if err := server.Start(); err != nil {
		log.Fatalf("Error starting: %v", err)
	}
}